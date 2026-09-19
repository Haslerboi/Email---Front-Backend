// TypeSafe AI Jev (System One) provider. Usage: --provider jev [--model jev-latest]
// Requires @typesafe-ai/sdk and TYPESAFE_API_KEY in env (.env is loaded by run.js).
import { LABELS } from '../labels.js';
import { RULES } from '../prompt.js';

export const makeJev = async ({ model = process.env.JEV_MODEL || 'jev-latest' }) => {
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY not set');
  const { TypeSafeClient, choice } = await import('@typesafe-ai/sdk');
  const client = new TypeSafeClient({ defaultModel: model });
  const criteria = Object.fromEntries(LABELS.map(l => [l.key, `${l.name}: ${l.hint}`]));
  const instructions = `Which label should Guy's email assistant give this email?\n${RULES}`;
  const name = `jev:${model}`;
  const classify = async (email) => {
    const t0 = Date.now();
    const state = {
      from: email.from, reply_to: email.replyTo || null, to: email.to, date: email.date,
      subject: email.subject || '', attachments: email.attachments || [],
      guy_already_replied_in_thread: !!email.guyRepliedEarlierInThread,
      has_list_unsubscribe: !!email.hasListUnsubscribe,
      body: email.body || ''
    };
    const res = await client.systemOne({ state, questions: { label: choice(instructions, criteria) } });
    const a = res.answers.label;
    return { label: a.choice, confidence: a.confidence, probabilities: a.probabilities, reasoning: `p=${(a.confidence).toFixed(2)}`,
      ms: Date.now() - t0, source: 'jev', usage: res.usage ? { input: res.usage.input_tokens ?? res.usage.input ?? 0, output: 0 } : undefined };
  };
  return { name, classify };
};
