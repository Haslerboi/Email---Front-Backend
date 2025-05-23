// Main router that combines all route modules
import { Router } from 'express';
import smsRoutes from './sms.js';
import telegramRoutes from './telegram.js';
import { getApiStatus } from '../services/apiStatus.js';
import EmailStateManager from '../services/email-state.js';

const router = Router();

// Welcome route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Email Assistant API',
    version: '1.0.0',
    endpoints: {
      sms: '/api/sms',
      telegram: '/api/telegram',
      status: '/api/status',
      emails: '/api/emails',
      // Future endpoints will be added here
    },
  });
});

// Mount route modules
router.use('/sms', smsRoutes);
router.use('/telegram', telegramRoutes);

// Future route modules will be mounted here
// router.use('/emails', emailRoutes);
// router.use('/auth', authRoutes);

router.get('/status', async (req, res) => {
  try {
    const status = await getApiStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

router.get('/emails', (req, res) => {
  try {
    const emails = EmailStateManager.listActiveEmails();
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default router; 