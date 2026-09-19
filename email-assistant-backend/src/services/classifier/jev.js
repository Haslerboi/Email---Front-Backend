// TypeSafe AI Jev (System One) backend. Returns a label with a calibrated confidence.
import { LABELS } from './labels.js';
import { RULES } from './prompt.js';
import { hasListUnsubscribe } from './rules.js';

let clientPromise = null;
const getClient = async () => {
  if (!clientPromise) {
    clientPromise = import('@typesafe-ai/sdk').then(({ TypeSafeClient }) =>
      new TypeSafeClient({ defaultModel: process.env.JEV_MODEL || 'jev-latest' }));
  }
  return clientPromise;
};

const criteria = Object.fromEntries(LABELS.map(l => [l.key, `${l.name}: ${l.hint}`]));
const instructions = `Which label should Guy's email assistant give this email?\n${RULES}`;

export const classifyWithJev = async (email) => {
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY not configured');
  const t0 = Date.now();
  const { choice } = await import('@typesafe-ai/sdk');
  const client = await getClient();
  const state = {
    from: email.from, reply_to: email.replyTo || null, to: email.to, date: email.date,
    subject: email.subject || '', attachments: email.attachments || [],
    guy_already_replied_in_thread: !!email.guyRepliedEarlierInThread,
    has_list_unsubscribe: email.hasListUnsubscribe ?? hasListUnsubscribe(email),
    body: String(email.body || '').slice(0, 6000)
  };
  const res = await client.systemOne({ state, questions: { label: choice(instructions, criteria) } });
  const a = res.answers.label;
  return { label: a.choice, confidence: a.confidence, probabilities: a.probabilities,
    reasoning: `Jev p=${a.confidence.toFixed(2)}`, source: 'jev', ms: Date.now() - t0 };
};
