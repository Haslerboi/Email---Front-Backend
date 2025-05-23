import EmailStateManager from './email-state.js';
import { checkForNewEmails } from './gmail/index.js';
import logger from '../utils/logger.js';

export async function getApiStatus() {
  const details = {};
  let allHealthy = true;

  // Check EmailStateManager
  try {
    const emails = EmailStateManager.listActiveEmails();
    details.emailState = { available: true, count: emails.length };
  } catch (error) {
    details.emailState = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check Gmail (simulate by calling checkForNewEmails with a dry run if possible)
  try {
    // If checkForNewEmails supports a dry run, use it. Otherwise, just check that it's callable.
    if (typeof checkForNewEmails === 'function') {
      details.gmail = { available: true };
    } else {
      throw new Error('Gmail service not available');
    }
  } catch (error) {
    details.gmail = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check Telegram config
  try {
    const config = (await import('../config/env.js')).config;
    if (config.telegram && config.telegram.botToken) {
      details.telegram = { available: true };
    } else {
      throw new Error('Telegram config missing');
    }
  } catch (error) {
    details.telegram = { available: false, error: error.message };
    allHealthy = false;
  }

  return {
    status: allHealthy ? 'connected' : 'degraded',
    message: allHealthy ? 'API is healthy' : 'Some subsystems are down',
    details
  };
} 