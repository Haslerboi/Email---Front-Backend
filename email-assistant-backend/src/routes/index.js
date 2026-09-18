// Main router that combines all route modules
import { Router } from 'express';
import { getApiStatus } from '../services/apiStatus.js';
import { config } from '../config/env.js';
import ProcessedEmailsService from '../services/processedEmails.js';
import PendingNotificationsService from '../services/pendingNotifications.js';
import { classifyEmail, classifyWithModel, CLASSIFIER_MODEL, CLASSIFIER_REASONING_EFFORT, LABELS } from '../services/classifier/index.js';
import logger from '../utils/logger.js';

const router = Router();

// Welcome route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Email Assistant API - Simplified categorization and inbox organization',
    version: '3.0.0',
    endpoints: {
      status: '/api/status',
      'processed-emails': '/api/processed-emails',
      'processed-emails-clear': '/api/processed-emails/clear (POST - resets all processed emails)',
      'pending-notifications': '/api/pending-notifications',
      classify: '/api/classify (GET with ?from=&subject=&body= or POST JSON - run the production classifier)'
    },
    model: CLASSIFIER_MODEL,
    reasoningEffort: CLASSIFIER_REASONING_EFFORT,
    labels: LABELS.map(l => `${l.name} (${l.key}) - ${l.hint}`)
  });
});

router.get('/status', async (req, res) => {
  try {
    const status = await getApiStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// GET /api/processed-emails - Get processed emails statistics
router.get('/processed-emails', async (req, res) => {
  try {
    const stats = ProcessedEmailsService.getStats();
    res.json({
      status: 'success',
      stats: stats
    });
  } catch (error) {
    logger.error('Error fetching processed emails stats:', { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to retrieve processed emails stats' });
  }
});

// POST /api/processed-emails/clear - Clear processed emails (for testing)
router.post('/processed-emails/clear', async (req, res) => {
  try {
    const stats = ProcessedEmailsService.getStats();
    const previousCount = stats.totalProcessed;
    
    // Reset the processed emails service (complete clear)
    await ProcessedEmailsService.reset();
    logger.info(`API: Manually reset processed emails cache (cleared ${previousCount} entries)`);
    res.json({
      status: 'success',
      message: `Successfully reset processed emails cache (cleared ${previousCount} entries)`,
      previousCount: previousCount,
      currentCount: 0
    });
  } catch (error) {
    logger.error('Error resetting processed emails:', { error: error.message });
    res.status(500).json({ status: 'error', message: 'Failed to reset processed emails cache' });
  }
});

// GET /api/pending-notifications - Get pending notifications statistics
router.get('/pending-notifications', async (req, res) => {
  try {
    const stats = PendingNotificationsService.getStats();
    res.json({
      status: 'success',
      stats: stats
    });
  } catch (error) {
    logger.error('Error fetching pending notifications stats:', { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to retrieve pending notifications stats' });
  }
});

// POST /api/classify - run the production classifier (rules + model) on a supplied email
// Body: { from, subject, body, to?, replyTo?, attachments?, guyRepliedEarlierInThread?, headers? }
// GET  /api/classify?from=&subject=&body=  - same, for quick curl checks
const runClassify = async (req, res) => {
  try {
    const src = req.method === 'GET' ? req.query : (req.body || {});
    const email = {
      from: src.from || 'Railway <hello@notify.railway.app>',
      to: src.to || 'guy@thecedar.co',
      replyTo: src.replyTo || '',
      date: src.date || new Date().toISOString(),
      subject: src.subject ?? 'Deployment crashed for Assistant-Backend',
      body: src.body ?? 'Your Railway service crashed. Please check logs.',
      attachments: Array.isArray(src.attachments) ? src.attachments : (typeof src.attachments === 'string' && src.attachments ? src.attachments.split(',') : []),
      guyRepliedEarlierInThread: src.guyRepliedEarlierInThread === true || src.guyRepliedEarlierInThread === 'true',
      headers: src.headers || {}
    };
    const modelOnly = src.modelOnly === true || src.modelOnly === 'true';
    const result = modelOnly ? await classifyWithModel(email) : await classifyEmail(email);
    res.json({ ok: true, model: CLASSIFIER_MODEL, effort: CLASSIFIER_REASONING_EFFORT, input: email, result });
  } catch (e) {
    logger.error('Error in /api/classify', { error: e.message, tag: 'classify' });
    res.status(500).json({ ok: false, error: e.message });
  }
};
router.get('/classify', runClassify);
router.post('/classify', runClassify);

export default router; 

// Simple probe endpoint for GPT-5-mini via Responses API
router.get('/test-gpt5-mini', async (req, res) => {
  try {
    if (!config?.openai?.apiKey) {
      return res.status(500).json({ ok: false, error: 'No OPENAI_API_KEY configured' });
    }
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: CATEGORIZATION_MODEL,
        instructions: 'Return exactly the string OK. Do not include any reasoning.',
        input: 'Say OK',
        reasoning: { effort: CATEGORIZATION_REASONING_EFFORT },
        max_output_tokens: 512
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return res.status(resp.status).json({ ok: false, error: text });
    }
    const data = JSON.parse(text);
    return res.json({ ok: true, output_text: data.output_text, raw: data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Debug endpoint to run the categorization prompt directly and return raw model output
router.get('/test-categorization', async (req, res) => {
  try {
    const senderEmail = req.query.sender || 'Railway <hello@notify.railway.app>';
    const emailSubject = req.query.subject || 'Deployment crashed for Assistant-Backend in perceptive-cat!';
    const emailBody = req.query.body || 'Your Railway service crashed. Please check logs.';

    const prompt = `You are analyzing an email for a photographer/videographer business.\n\nYour task is to categorize the email into ONE of these four categories EXACTLY as written:\n- "Reply Needed"\n- "Invoices"\n- "Spam"\n- "Notifications"\n\nEmail to categorize:\nSender: ${senderEmail}\nSubject: ${emailSubject}\nBody: ${emailBody}\n\nReturn ONLY a JSON object with fields: category, reasoning.`;

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: CATEGORIZATION_MODEL,
        instructions: 'You are a strict JSON generator. Return ONLY a JSON object matching the requested schema. No prose, no code fences.',
        input: `${prompt}`,
        reasoning: { effort: CATEGORIZATION_REASONING_EFFORT },
        max_output_tokens: 800,
        text: {
          format: {
            type: 'json_schema',
            name: 'EmailCategorization',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                category: { type: 'string', enum: ['Reply Needed', 'Invoices', 'Spam', 'Notifications'] },
                reasoning: { type: 'string' }
              },
              required: ['category', 'reasoning']
            }
          }
        }
      })
    });

    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    // Try to surface parsed content or extract message text
    let extractedText = data?.output_text || null;
    if (!extractedText && Array.isArray(data?.output)) {
      const msg = data.output.find(o => o.type === 'message');
      if (msg && Array.isArray(msg.content) && msg.content[0]?.text) {
        extractedText = msg.content[0].text;
      }
    }
    return res.status(resp.ok ? 200 : resp.status).json({ ok: resp.ok, status: resp.status, raw: text, parsed: data?.output_parsed || null, output_text: extractedText });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});