// Score a classifier against the hand-labelled eval set.
// Usage:
//   node eval/run.js --provider production                      (rules + model, what Railway runs)
//   node eval/run.js --provider production --backend jev --minconf 0.6   (rules + Jev, Luna below confidence)
//   node eval/run.js --provider openai --model gpt-5.6-luna --effort none   (model only)
//   node eval/run.js --provider openai --model gpt-5.6-luna --effort low
//   node eval/run.js --provider legacy --collapse4          (production 4-way prompt, fair comparison)
//   node eval/run.js --provider jev
// Options: --concurrency 4  --limit 20  --only <label>  --collapse4
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LABEL_KEYS } from './labels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data', 'emails.json');
const RESULTS_DIR = path.join(__dirname, 'results');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
  return acc;
}, []));

// 8 -> 4 mapping for comparing against the production prompt
const COLLAPSE = {
  reply_needed: 'reply_needed', action_required: 'reply_needed', reference: 'reply_needed', client_fyi: 'reply_needed',
  invoices: 'invoices', notification: 'notification', spam: 'spam'
};

const makeProvider = async () => {
  const p = args.provider || 'openai';
  if (p === 'openai') { const { makeOpenAI } = await import('./providers/openai.js'); return makeOpenAI({ model: args.model, effort: args.effort }); }
  if (p === 'production') { const { makeProduction } = await import('./providers/production.js'); return makeProduction({ model: args.model, effort: args.effort, backend: args.backend, minconf: args.minconf }); }
  if (p === 'legacy') { const { makeLegacy } = await import('./providers/legacy.js'); return makeLegacy({ model: args.model, effort: args.effort }); }
  if (p === 'jev')    { const { makeJev } = await import('./providers/jev.js'); return makeJev({ model: args.model }); }
  throw new Error(`Unknown provider ${p}`);
};

const pool = async (items, n, fn) => {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
};

const main = async () => {
  const all = JSON.parse(await fs.readFile(DATA, 'utf8'));
  let items = all.filter(e => e.label);
  if (args.only) items = items.filter(e => e.label === args.only);
  if (args.limit) items = items.slice(0, +args.limit);
  if (!items.length) { console.error('No labelled emails yet. Run: npm run eval:label'); process.exit(1); }
  const unl = all.length - all.filter(e => e.label).length;
  if (unl) console.log(`(${unl} emails still unlabelled and skipped)`);

  const provider = await makeProvider();
  const collapse = !!args.collapse4;
  const keys = collapse ? [...new Set(Object.values(COLLAPSE))] : LABEL_KEYS;
  console.log(`Provider: ${provider.name} · ${items.length} emails · ${collapse ? '4-way (collapsed)' : '8-way'}\n`);

  const results = await pool(items, +(args.concurrency || 4), async (e, i) => {
    try {
      const r = await provider.classify(e);
      process.stdout.write(`${String(i + 1).padStart(3)} ${r.label === e.label || (collapse && COLLAPSE[r.label] === COLLAPSE[e.label]) ? '✓' : '✗'} ${(e.subject || '(no subject)').slice(0, 60)}\n`);
      return { id: e.id, subject: e.subject, from: e.from, truth: e.label, pred: r.label, ...r };
    } catch (err) {
      process.stdout.write(`${String(i + 1).padStart(3)} ! ${(e.subject || '').slice(0, 60)} — ${err.message.slice(0, 120)}\n`);
      return { id: e.id, subject: e.subject, from: e.from, truth: e.label, pred: null, error: err.message };
    }
  });

  const T = r => collapse ? COLLAPSE[r.truth] : r.truth;
  const P = r => collapse ? COLLAPSE[r.pred] : r.pred;
  const ok = results.filter(r => r.pred && T(r) === P(r)).length;
  const errs = results.filter(r => !r.pred).length;
  const acc = ok / results.length;

  // confusion matrix
  const conf = {}; keys.forEach(t => { conf[t] = {}; keys.forEach(p => conf[t][p] = 0); });
  results.filter(r => r.pred).forEach(r => { conf[T(r)][P(r)] = (conf[T(r)][P(r)] || 0) + 1; });

  console.log(`\nAccuracy: ${ok}/${results.length} = ${(acc * 100).toFixed(1)}%${errs ? `  (${errs} errors)` : ''}`);
  const avgMs = results.filter(r => r.ms).reduce((a, r) => a + r.ms, 0) / Math.max(1, results.filter(r => r.ms).length);
  const inTok = results.reduce((a, r) => a + (r.usage?.input || 0), 0), outTok = results.reduce((a, r) => a + (r.usage?.output || 0), 0);
  console.log(`Avg latency: ${avgMs.toFixed(0)} ms${inTok ? ` · tokens in/out: ${inTok}/${outTok}` : ''}\n`);

  console.log('Per label (precision / recall / n):');
  keys.forEach(k => {
    const tp = conf[k][k] || 0;
    const n = keys.reduce((a, p) => a + (conf[k][p] || 0), 0);
    const predN = keys.reduce((a, t) => a + (conf[t][k] || 0), 0);
    if (n || predN) console.log(`  ${k.padEnd(18)} P ${predN ? (tp / predN * 100).toFixed(0).padStart(3) : '  -'}%  R ${n ? (tp / n * 100).toFixed(0).padStart(3) : '  -'}%  n=${n}`);
  });

  console.log('\nConfusion (rows = truth, cols = predicted):');
  const short = k => k.replace('_', '').slice(0, 6);
  console.log('  ' + ''.padEnd(8) + keys.map(short).map(s => s.padStart(7)).join(''));
  keys.forEach(t => console.log('  ' + short(t).padEnd(8) + keys.map(p => String(conf[t][p] || 0).padStart(7)).join('')));

  // Destination scoring: the four inbox labels are interchangeable; what matters is where the mail ends up.
  const DEST = { reply_needed: 'inbox', action_required: 'inbox', reference: 'inbox', client_fyi: 'inbox',
    invoices: 'invoices', notification: 'notification', spam: 'spam' };
  const destOk = results.filter(r => r.pred && DEST[r.truth] === DEST[r.pred]).length;
  const inboxTruth = results.filter(r => r.pred && DEST[r.truth] === 'inbox');
  const lostFromInbox = inboxTruth.filter(r => DEST[r.pred] !== 'inbox');
  const wronglyInInbox = results.filter(r => r.pred && DEST[r.truth] !== 'inbox' && DEST[r.pred] === 'inbox');
  console.log(`\nDestination accuracy (inbox / invoices / notification / spam): ${destOk}/${results.length} = ${(destOk / results.length * 100).toFixed(1)}%`);
  console.log(`  Inbox mail wrongly filed (the bad error): ${lostFromInbox.length}/${inboxTruth.length}`);
  lostFromInbox.forEach(r => console.log(`    ${r.truth.padEnd(16)} → ${String(r.pred).padEnd(13)} ${r.from.slice(0, 30).padEnd(31)} ${(r.subject || '').slice(0, 50)}`));
  console.log(`  Folder mail left in inbox (annoying, not harmful): ${wronglyInInbox.length}`);
  wronglyInInbox.forEach(r => console.log(`    ${r.truth.padEnd(16)} → ${String(r.pred).padEnd(13)} ${r.from.slice(0, 30).padEnd(31)} ${(r.subject || '').slice(0, 50)}`));
  const folderConf = {}; results.filter(r => r.pred).forEach(r => { const k = `${DEST[r.truth]}→${DEST[r.pred]}`; if (DEST[r.truth] !== DEST[r.pred] && DEST[r.truth] !== 'inbox' && DEST[r.pred] !== 'inbox') folderConf[k] = (folderConf[k] || 0) + 1; });
  if (Object.keys(folderConf).length) console.log(`  Folder-to-folder mixups: ${Object.entries(folderConf).map(([k, v]) => `${k} ${v}`).join(', ')}`);

  const misses = results.filter(r => r.pred && T(r) !== P(r));
  if (misses.length) {
    console.log('\nMisses:');
    misses.forEach(r => console.log(`  ${r.truth.padEnd(18)} → ${String(r.pred).padEnd(18)} ${r.from.slice(0, 30).padEnd(31)} ${(r.subject || '').slice(0, 50)}${r.source ? `  [${r.source}]` : ''}${r.confidence !== undefined ? `  (conf ${(+r.confidence).toFixed(2)})` : ''}\n      ${(r.reasoning || '').slice(0, 140)}`));
  }

  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${provider.name.replace(/[^a-z0-9]+/gi, '-')}-${collapse ? '4way-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(file, JSON.stringify({ provider: provider.name, collapse, accuracy: acc, destAccuracy: destOk / results.length, lostFromInbox: lostFromInbox.length, avgMs, results }, null, 2));
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
};

main().catch(e => { console.error(e); process.exit(1); });
