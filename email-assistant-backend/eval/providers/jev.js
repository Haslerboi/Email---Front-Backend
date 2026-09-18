// TypeSafe AI Jev (System One) provider. Usage: --provider jev [--model jev-latest]
// Requires: npm i @typesafe-ai/sdk  and TYPESAFE_API_KEY in env.
// NOTE: written against the published SDK docs without a key to test on. If the SDK's API
// differs, the error message below will say so; adjust the import/call shape here only.
import { LABELS } from '../labels.js';
import { RULES } from '../prompt.js';

export const makeJev = async ({ model = process.env.JEV_MODEL || 'jev-latest' }) => {
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY not set');
  let sdk;
  try { sdk = await import('@typesafe-ai/sdk'); }
  catch { throw new Error('Run: npm i @typesafe-ai/sdk'); }
  const { TypeSafeClient, Choice } = sdk;
  if (!TypeSafeClient || !Choice) throw new Error(`@typesafe-ai/sdk exports: ${Object.keys(sdk).join(', ')} — adjust eval/providers/jev.js`);
  const client = new TypeSafeClient({ model });
  const criteria = Object.fromEntries(LABELS.map(l => [l.key, l.hint]));
  const name = `jev:${model}`;
  const classify = async (email) => {
    const t0 = Date.now();
    const state = {
      from: email.from, replyTo: email.replyTo || null, to: email.to, date: email.date,
      subject: email.subject, attachments: email.attachments || [],
      guyRepliedEarlierInThread: !!email.guyRepliedEarlierInThread,
      body: email.body || ''
    };
    const res = await client.systemOne({
      state,
      questions: {
        label: new Choice({ instructions: `Which label should this email get for Guy?\n${RULES}`, criteria })
      }
    });
    const a = res.answers.label;
    return { label: a.choice, confidence: a.confidence, probabilities: a.probabilities, ms: Date.now() - t0 };
  };
  return { name, classify };
};
