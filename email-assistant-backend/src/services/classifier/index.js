// Email classifier: deterministic rules first, then the model (OpenAI Responses API).
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';
import { LABELS, LABEL_KEYS, INBOX_LABELS, GMAIL_LABEL } from './labels.js';
import { buildSystemPrompt, buildUserPrompt, jsonSchema } from './prompt.js';
import { applyRules, hasListUnsubscribe } from './rules.js';

export const CLASSIFIER_MODEL = process.env.CATEGORIZATION_MODEL || 'gpt-6-luna';
export const CLASSIFIER_REASONING_EFFORT = process.env.CATEGORIZATION_REASONING_EFFORT || 'medium';
// Which model decides emails the rules leave open: 'openai' (Luna) or 'jev' (TypeSafe, Luna as fallback).
export const CLASSIFIER_PROVIDER = process.env.CLASSIFIER_PROVIDER || 'openai';
// With provider=jev: below this confidence, ask Luna instead.
export const JEV_MIN_CONFIDENCE = parseFloat(process.env.JEV_MIN_CONFIDENCE || '0.6');
export { LABELS, LABEL_KEYS, INBOX_LABELS, GMAIL_LABEL };

const SAFE_FALLBACK = { label: 'reply_needed', reasoning: 'Classifier unavailable, kept in inbox for safety', source: 'fallback' };

/**
 * OpenAI (Luna) classification.
 * @param {object} email - { from, replyTo, to, date, subject, body, attachments, guyRepliedEarlierInThread, headers }
 */
export const classifyWithOpenAI = async (email) => {
  if (!config.openai?.apiKey) throw new Error('OPENAI_API_KEY not configured');
  const t0 = Date.now();
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openai.apiKey}` },
    body: JSON.stringify({
      model: CLASSIFIER_MODEL,
      instructions: buildSystemPrompt(),
      input: buildUserPrompt({ ...email, hasListUnsubscribe: email.hasListUnsubscribe ?? hasListUnsubscribe(email) }),
      reasoning: { effort: CLASSIFIER_REASONING_EFFORT },
      max_output_tokens: 600,
      text: { format: { type: 'json_schema', name: 'EmailLabel', schema: jsonSchema } }
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let text = data.output_text ?? '';
  if (!text && Array.isArray(data.output)) text = data.output.find(o => o.type === 'message')?.content?.[0]?.text ?? '';
  const parsed = data.output_parsed ?? JSON.parse(text);
  const label = LABEL_KEYS.includes(parsed.label) ? parsed.label : 'reply_needed';
  return { label, reasoning: parsed.reasoning || '', source: 'model', ms: Date.now() - t0,
    usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined };
};

/**
 * Model-only classification per CLASSIFIER_PROVIDER. Exported so the eval harness scores what production runs.
 * jev: use Jev's answer when confident, otherwise escalate to Luna.
 */
export const classifyWithModel = async (email) => {
  if (CLASSIFIER_PROVIDER !== 'jev') return classifyWithOpenAI(email);
  let jev = null;
  try {
    const { classifyWithJev } = await import('./jev.js');
    jev = await classifyWithJev(email);
    if (LABEL_KEYS.includes(jev.label) && jev.confidence >= JEV_MIN_CONFIDENCE) return jev;
  } catch (e) {
    logger.warn(`Jev failed, falling back to OpenAI: ${e.message}`, { tag: 'classifier' });
  }
  const luna = await classifyWithOpenAI(email);
  return { ...luna, source: jev ? `jev<${JEV_MIN_CONFIDENCE.toFixed(2)}→model` : 'jev_error→model',
    reasoning: jev ? `Jev said ${jev.label} (p=${jev.confidence.toFixed(2)}); ${luna.reasoning}` : luna.reasoning };
};

/**
 * Full classification: rules, then model, with the inbox guarantee applied.
 * Never throws; falls back to reply_needed.
 */
export const classifyEmail = async (email) => {
  let ruled = null;
  try { ruled = applyRules(email); } catch (e) { logger.warn(`Rule evaluation failed: ${e.message}`, { tag: 'classifier' }); }
  if (ruled && ruled.label) {
    return { label: ruled.label, reasoning: ruled.reason, source: `rule:${ruled.rule}`, hold: ruled.hold };
  }
  try {
    const result = await classifyWithModel(email);
    if (ruled?.inbox && !INBOX_LABELS.includes(result.label)) {
      return { ...result, label: 'reply_needed', reasoning: `${ruled.reason}; model said ${result.label}, kept in inbox`, source: 'model+inbox_rule' };
    }
    return result;
  } catch (e) {
    logger.error(`Classifier model error: ${e.message}`, { tag: 'classifier', from: email.from, subject: email.subject });
    return SAFE_FALLBACK;
  }
};

export default { classifyEmail, classifyWithModel, classifyWithOpenAI, CLASSIFIER_MODEL, CLASSIFIER_REASONING_EFFORT, CLASSIFIER_PROVIDER };
