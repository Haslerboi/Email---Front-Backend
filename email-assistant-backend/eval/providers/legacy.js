// The pre-Sept-2026 production 4-way prompt, kept as a baseline.
// Its 4 outputs are mapped onto the 8-way keys; use --collapse4 to score fairly.
import { config } from '../../src/config/env.js';

const MAP = { 'Reply Needed': 'reply_needed', 'Invoices': 'invoices', 'Spam': 'spam', 'Notifications': 'notification' };

export const makeLegacy = ({ model = 'gpt-5.6-luna', effort = 'none' }) => {
  const name = `legacy4:${model}:${effort}`;
  const classify = async (email) => {
    const t0 = Date.now();
    // Same body the production code sends, minus logging.
    const prompt = `You are analyzing an email for a photographer/videographer business. The email content may contain a full conversation thread with multiple messages.

Your task is to categorize the email into ONE of these four categories EXACTLY as written:
- "Reply Needed" - legitimate business communications that should stay in inbox for manual response
- "Invoices" - financial/billing emails: bills, invoices, payment requests, statements, receipts, subscription billing
- "Spam" - marketing emails, promotions, newsletters, emails with unsubscribe links, obvious spam or phishing
- "Notifications" - automated system/service/platform notifications, alerts, reports, non-urgent automated messages

When unsure between "Reply Needed" and "Notifications", choose "Reply Needed".
When unsure between "Spam" and "Notifications", choose "Notifications" if it's from a legitimate service.

Email to categorize:
Sender: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Return ONLY a JSON object: {"category": "Reply Needed" | "Invoices" | "Spam" | "Notifications", "reasoning": "..."}`;
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openai.apiKey}` },
      body: JSON.stringify({
        model, instructions: 'Return ONLY a JSON object.', input: prompt, reasoning: { effort }, max_output_tokens: 600,
        text: { format: { type: 'json_schema', name: 'EmailCategorization', schema: {
          type: 'object', additionalProperties: false,
          properties: { category: { type: 'string', enum: Object.keys(MAP) }, reasoning: { type: 'string' } },
          required: ['category', 'reasoning'] } } }
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    let text = data.output_text ?? '';
    if (!text && Array.isArray(data.output)) text = data.output.find(o => o.type === 'message')?.content?.[0]?.text ?? '';
    const parsed = data.output_parsed ?? JSON.parse(text);
    return { label: MAP[parsed.category] ?? 'reply_needed', reasoning: parsed.reasoning, ms: Date.now() - t0,
      usage: data.usage ? { input: data.usage.input_tokens, output: data.usage.output_tokens } : undefined };
  };
  return { name, classify };
};
