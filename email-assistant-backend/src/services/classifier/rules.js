// Deterministic pre-model layer. Returns { label, reason, rule, hold? } for a decided email,
// { inbox: true, reason } when the sender is known and the model must pick an inbox label,
// or null when the model should decide freely.
import { SENDER_RULES } from './senderRules.js';

const AUTOMATED_LOCALPART = /^(no-?reply|noreply|do-?not-?reply|donotreply|notifications?|notify|alerts?|mailer|automated|system|bounce|postmaster|mailer-daemon)([+.-]|@|$)/i;

export const extractAddress = (from = '') => {
  const m = String(from).match(/<([^>]+)>/);
  return (m ? m[1] : String(from)).trim().toLowerCase();
};

export const isAutomatedAddress = (from = '') => AUTOMATED_LOCALPART.test(extractAddress(from));

const h = (email, name) => {
  const headers = email.headers || {};
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : '';
};

export const isAutoReply = (email) => {
  const auto = h(email, 'auto-submitted');
  if (auto && !/^no$/i.test(auto)) return true;
  if (h(email, 'x-autoreply') || h(email, 'x-autorespond') || /auto_reply|auto-reply/i.test(h(email, 'precedence'))) return true;
  return /^(automatic reply|auto(-| )?reply|out of office)\b/i.test(email.subject || '');
};

export const isBounce = (email) => /^(mailer-daemon|postmaster)@/i.test(extractAddress(email.from));

export const hasListUnsubscribe = (email) => !!h(email, 'list-unsubscribe');

const matchRule = (rule, address, from, subject) => {
  const m = rule.match;
  const hit = m instanceof RegExp
    ? m.test(from) || m.test(address)
    : (address === m.toLowerCase() || address.endsWith('@' + m.toLowerCase()) || address.endsWith('.' + m.toLowerCase()));
  if (!hit) return false;
  if (rule.subject && !rule.subject.test(subject || '')) return false;
  return true;
};

export const findSenderRule = (email) => {
  const address = extractAddress(email.from);
  return SENDER_RULES.find(r => matchRule(r, address, String(email.from || ''), email.subject)) || null;
};

const bodyIsEmpty = (email) => {
  const text = String(email.body || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[-_=*]{3,}/g, '')
    .replace(/^(regards|kind regards|thanks|cheers|best|sent from my \w+).*$/gim, '')
    .replace(/\s+/g, ' ').trim();
  return text.length < 60;
};

export const applyRules = (email) => {
  const senderRule = findSenderRule(email);
  const knownContact = !!(senderRule && senderRule.inbox);

  // 1. Bounces of Guy's own mail need attention; other bounces are noise.
  if (isBounce(email)) {
    return email.guyRepliedEarlierInThread
      ? { label: 'action_required', reason: 'Bounce of a message Guy sent', rule: 'bounce' }
      : { label: 'notification', reason: 'Delivery notification', rule: 'bounce' };
  }

  // 2. Auto-replies: from a known client -> notification; reply to Guy's own outreach -> reference.
  if (isAutoReply(email)) {
    if (!knownContact && email.guyRepliedEarlierInThread) {
      return { label: 'reference', reason: 'Auto-reply to a thread Guy started', rule: 'auto_reply' };
    }
    return { label: 'notification', reason: 'Out-of-office / automatic reply', rule: 'auto_reply' };
  }

  // 3. Explicit sender rule with a label.
  if (senderRule && senderRule.label) {
    return { label: senderRule.label, reason: `Sender rule: ${senderRule.match}`, rule: 'sender', hold: senderRule.hold };
  }

  // 4. Attachment with an empty body from a person: keep it, never bin it.
  if ((email.attachments || []).length && bodyIsEmpty(email) && !isAutomatedAddress(email.from) && !hasListUnsubscribe(email)) {
    return { label: 'reference', reason: 'Attachment with no message body from a person', rule: 'attachment_only' };
  }

  // 5. Known contact, or Guy already replied in this thread to a person: inbox guaranteed, model picks which.
  if (knownContact) return { inbox: true, reason: `Known contact: ${senderRule.match}` };
  if (email.guyRepliedEarlierInThread && !isAutomatedAddress(email.from) && !hasListUnsubscribe(email)) {
    return { inbox: true, reason: 'Guy already replied in this thread' };
  }

  return null;
};
