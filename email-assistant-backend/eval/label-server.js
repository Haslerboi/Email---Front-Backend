// Tiny local labelling UI. Run: npm run eval:label  then open http://localhost:4321
import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LABELS } from './labels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, 'data', 'emails.json');
const PORT = process.env.EVAL_LABEL_PORT || 4321;

const app = express();
app.use(express.json({ limit: '2mb' }));

const load = async () => JSON.parse(await fs.readFile(DATA, 'utf8'));
const save = async (items) => fs.writeFile(DATA, JSON.stringify(items, null, 2));

app.get('/', async (_req, res) => res.sendFile(path.join(__dirname, 'ui.html')));
app.get('/api/labels', (_req, res) => res.json(LABELS));
app.get('/api/emails', async (_req, res) => {
  try { res.json(await load()); }
  catch (e) { res.status(500).json({ error: `Could not read ${DATA}: ${e.message}` }); }
});
app.post('/api/label', async (req, res) => {
  const { id, label, note } = req.body || {};
  const items = await load();
  const item = items.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'not found' });
  item.label = label ?? null;
  if (note !== undefined) item.note = note;
  await save(items);
  res.json({ ok: true, labelled: items.filter(i => i.label).length, total: items.length });
});

app.listen(PORT, () => console.log(`Labelling UI: http://localhost:${PORT}`));
