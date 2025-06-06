// Main router that combines all route modules
import { Router } from 'express';
import { getApiStatus } from '../services/apiStatus.js';
import { getAllWhitelistedSenders, addWhitelistedSender, removeWhitelistedSender } from '../services/whitelistService.js';
import ProcessedEmailsService from '../services/processedEmails.js';
import PendingNotificationsService from '../services/pendingNotifications.js';
import { categorizeEmail } from '../services/geminiService.js';
import logger from '../utils/logger.js';

const router = Router();

// Welcome route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Email Assistant API - New Categorization System with Studio Ninja Support',
    version: '2.1.0',
    endpoints: {
      status: '/api/status',
      whitelist: '/api/whitelist',
      'whitelist-add': '/api/whitelist/add',
      'whitelist-remove': '/api/whitelist/remove',
      'processed-emails': '/api/processed-emails',
      'processed-emails-clear': '/api/processed-emails/clear (POST - resets all processed emails)',
      'pending-notifications': '/api/pending-notifications',
      'test-gemini': '/api/test-gemini (POST - test Gemini categorization)'
    },
    categories: [
      'Draft Email - Automatic draft creation for legitimate business emails',
      'Studio Ninja Wedding Enquiry - Special handling for wedding enquiries with reply-to field (uses wedding-specific prompt)',
      'Studio Ninja System - System emails from Studio Ninja without reply-to (mark as read, no processing)',
      'Invoices - Automatic filing to Invoices folder',
      'Spam - Automatic move to Email Prison',
      'Notifications - Stay in inbox for 5 minutes, then move to Notification folder',
      'Whitelisted Spam - Mark as read, keep in inbox'
    ]
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

// GET /api/whitelist - Get all whitelisted senders
router.get('/whitelist', async (req, res) => {
  try {
    const whitelistedSenders = getAllWhitelistedSenders();
    res.json({
      status: 'success',
      count: whitelistedSenders.length,
      senders: whitelistedSenders
    });
  } catch (error) {
    logger.error('Error fetching whitelisted senders:', { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to retrieve whitelisted senders' });
  }
});

// POST /api/whitelist/add - Add a sender to whitelist
router.post('/whitelist/add', async (req, res) => {
  const { senderEmail } = req.body;
  
  if (!senderEmail) {
    return res.status(400).json({ status: 'error', message: 'senderEmail is required' });
  }
  
  try {
    const added = await addWhitelistedSender(senderEmail);
    if (added) {
      logger.info(`Manually added sender to whitelist: ${senderEmail}`);
      res.json({
        status: 'success',
        message: `Successfully added ${senderEmail} to whitelist`
      });
    } else {
      res.json({
        status: 'info',
        message: `${senderEmail} was already in the whitelist`
      });
    }
  } catch (error) {
    logger.error('Error adding sender to whitelist:', { error: error.message, senderEmail });
    res.status(500).json({ status: 'error', message: 'Failed to add sender to whitelist' });
  }
});

// DELETE /api/whitelist/remove - Remove a sender from whitelist
router.delete('/whitelist/remove', async (req, res) => {
  const { senderEmail } = req.body;
  
  if (!senderEmail) {
    return res.status(400).json({ status: 'error', message: 'senderEmail is required' });
  }
  
  try {
    const removed = await removeWhitelistedSender(senderEmail);
    if (removed) {
      logger.info(`Manually removed sender from whitelist: ${senderEmail}`);
      res.json({
        status: 'success',
        message: `Successfully removed ${senderEmail} from whitelist`
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: `${senderEmail} was not found in the whitelist`
      });
    }
  } catch (error) {
    logger.error('Error removing sender from whitelist:', { error: error.message, senderEmail });
    res.status(500).json({ status: 'error', message: 'Failed to remove sender from whitelist' });
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

// POST /api/test-gemini - Test Gemini categorization
router.post('/test-gemini', async (req, res) => {
  try {
    const { emailBody, senderEmail, emailSubject } = req.body;
    
    // Use default test data if not provided
    const testEmailBody = emailBody || "Hello, I'm interested in your photography services for my wedding in July. Could you please send me your pricing and availability? Thank you!";
    const testSenderEmail = senderEmail || "bride@example.com";
    const testEmailSubject = emailSubject || "Wedding Photography Inquiry";
    
    logger.info(`Testing Gemini categorization for: ${testSenderEmail} - "${testEmailSubject}"`, { tag: 'testGemini' });
    
    const result = await categorizeEmail(testEmailBody, testSenderEmail, testEmailSubject);
    
          res.json({
        status: 'success',
        testData: {
          emailBody: testEmailBody,
          senderEmail: testSenderEmail,
          emailSubject: testEmailSubject
        },
      result: result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error in Gemini test endpoint:', { 
      error: error.message, 
      stack: error.stack,
      tag: 'testGemini'
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to test Gemini categorization',
      error: error.message
    });
  }
});

export default router; 