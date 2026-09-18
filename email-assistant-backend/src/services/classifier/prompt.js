// Builds the classification prompt from the shared taxonomy + rules in docs/classification-design.md
import { LABELS } from './labels.js';

export const RULES = `
Rules (apply top-down; the first matching rule wins):
1. A real person is asking Guy something by email and expects an email reply -> reply_needed.
   This includes client questions, quote requests, edit feedback, scheduling, and human messages from the
   accountant. The word "invoice" in a human message does not change this.
2. Guy has to DO something but nobody expects an email reply -> action_required. Examples: a client says
   "send me the bill / invoice" to close a job; a bill that must be paid manually (rates, overdue notice,
   failed card, invoice with bank details and no direct debit); a compliance deadline (Companies Office,
   IRD); a platform relaying a person Guy must answer on that platform (Builderscrack, Airbnb host).
3. Context Guy wants at hand for a job with nothing to do now -> reference. Brand guidelines, briefs,
   run sheets, schedules, calendar invites from clients, and auto-replies to Guy's own outreach.
4. A client or contact closing a thread Guy is in: thanks, "looks great", "paid", "see you then" -> client_fyi.
5. Any money record where nothing is required -> invoices. Receipts (business or personal), bills that will
   be collected by direct debit, "upcoming direct debit" notices, subscription charges, remittance advices,
   PayPal money in or out, royalty statements, payouts. Personal purchases count too.
6. Automated status mail -> notification. Shipping, downloads, login codes, security alerts, password resets,
   "new device" alerts, tax-form requests from platforms, ACC/government information letters, order
   confirmations for food, out-of-office, bounces, platform "thanks for using us".
7. Marketing of any kind -> spam. Newsletters (even opt-in), product updates, promotions, review requests,
   cold sales pitches even when personalised and asking a question, real-estate agents prospecting
   (listings, appraisals), accountant's marketing mailers.
Context: Guy runs The Cedar, a photography and video business in Auckland. Key clients are real-estate agencies
(Bayleys, NZ Sotheby's), corporate clients (BNB Group, Payper, JLE, Comms Council), and wedding couples. His
accountant is SBA Burnside. Guy reads reply_needed, action_required, reference and client_fyi in his inbox;
everything else is filed.`;

export const buildSystemPrompt = () => `You classify one email for Guy Hasler into exactly one label.

Labels:
${LABELS.map(l => `- ${l.key}: ${l.hint}`).join('\n')}
${RULES}

Return JSON: {"label": <one of ${LABELS.map(l => l.key).join(' | ')}>, "reasoning": "<one sentence>"}`;

export const buildUserPrompt = (e) => `From: ${e.from}
${e.replyTo ? `Reply-To: ${e.replyTo}\n` : ''}To: ${e.to}
Date: ${e.date}
Subject: ${e.subject || '(no subject)'}
Attachments: ${e.attachments?.length ? e.attachments.join(', ') : 'none'}
Guy has already replied earlier in this thread: ${e.guyRepliedEarlierInThread ? 'yes' : 'no'}
Has List-Unsubscribe header (bulk mail): ${e.hasListUnsubscribe ? 'yes' : 'no'}

Body:
${e.body || '(empty body)'}`;

export const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    label: { type: 'string', enum: LABELS.map(l => l.key) },
    reasoning: { type: 'string' }
  },
  required: ['label', 'reasoning']
};
