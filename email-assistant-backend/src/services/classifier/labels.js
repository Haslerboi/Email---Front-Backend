// Shared label taxonomy for the eval set. Keep in sync with docs/classification-design.md.
// Seven labels, matching how Guy actually labelled the eval set (Sept 2026).
export const LABELS = [
  { key: 'reply_needed',    name: 'Reply Needed',    hint: 'A person is asking Guy something by email and expects a reply. Stays in inbox.' },
  { key: 'action_required', name: 'Action Required', hint: 'Guy must do something but not reply by email: send an invoice, pay manually, respond on a platform, fix a failed payment, meet a deadline. Stays in inbox.' },
  { key: 'reference',       name: 'Reference',       hint: 'Context for a job, nothing to do now: brand guidelines, briefs, schedules, client calendar invites, replies to Guy\'s own outreach. Stays in inbox.' },
  { key: 'client_fyi',      name: 'Client FYI',      hint: 'A client closing a thread: thanks, acknowledgement, confirmation. Nothing asked. Stays in inbox.' },
  { key: 'invoices',        name: 'Invoices',        hint: 'Any money record with nothing to do: receipts, paid or auto-paid bills, direct-debit notices, remittances, payouts, royalties. Business or personal.' },
  { key: 'notification',    name: 'Notification',    hint: 'Automated status only: shipping, downloads, login codes, security alerts, password resets, infra, reminders, out-of-office, platform admin.' },
  { key: 'spam',            name: 'Email Prison',    hint: 'Marketing, newsletters, cold pitches (even personalised), real-estate prospecting, review requests, phishing.' },
];
export const LABEL_KEYS = LABELS.map(l => l.key);
// Labels that stay in the inbox (unread); the rest are filed.
export const INBOX_LABELS = ['reply_needed', 'action_required', 'reference', 'client_fyi'];
// Gmail label to add for each key. null = no label (plain inbox). Filed labels remove INBOX.
export const GMAIL_LABEL = {
  reply_needed: null,
  action_required: 'Action Required',
  reference: 'Reference',
  client_fyi: 'Client FYI',
  invoices: 'Invoices',
  notification: 'Notification',
  spam: 'Email Prison',
};
