import TaskStateManager from './email-state.js';
import { checkForNewEmails } from './gmail/index.js';
import ProcessedEmailsService from './processedEmails.js';
import logger from '../utils/logger.js';

export async function getApiStatus() {
  const details = {};
  let allHealthy = true;

  // Check TaskStateManager (formerly EmailStateManager)
  try {
    const tasks = TaskStateManager.listPendingTasks();
    details.taskState = { available: true, count: tasks.length };
  } catch (error) {
    logger.error('Error checking TaskState in apiStatus:', error);
    details.taskState = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check Gmail service availability
  try {
    if (typeof checkForNewEmails === 'function') {
      details.gmailService = { available: true, status: 'Service function available' };
    } else {
      throw new Error('Gmail service (checkForNewEmails function) not available');
    }
  } catch (error) {
    logger.error('Error checking Gmail service in apiStatus:', error);
    details.gmailService = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check OpenAI API Key (basic check, not a live call for status)
  try {
    const config = (await import('../config/env.js')).config;
    if (config.openai && config.openai.apiKey) {
      details.openaiConfig = { available: true, status: 'API key configured' };
    } else {
      throw new Error('OpenAI API key not configured');
    }
  } catch (error) {
    logger.error('Error checking OpenAI config in apiStatus:', error);
    details.openaiConfig = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check Gemini API Key 
  try {
    const config = (await import('../config/env.js')).config;
    if (config.gemini && config.gemini.apiKey) {
      details.geminiConfig = { available: true, status: 'API key configured' };
    } else {
      throw new Error('Gemini API key not configured');
    }
  } catch (error) {
    logger.error('Error checking Gemini config in apiStatus:', error);
    details.geminiConfig = { available: false, error: error.message };
    allHealthy = false;
  }

  // Check processed emails service
  try {
    const processedStats = ProcessedEmailsService.getStats();
    details.processedEmails = {
      available: true,
      totalProcessed: processedStats.totalProcessed,
      lastCheckTime: processedStats.lastCheckTime,
      timeSinceLastCheck: processedStats.timeSinceLastCheck ? `${Math.round(processedStats.timeSinceLastCheck / 1000)}s` : 'never'
    };
  } catch (error) {
    logger.error('Error checking processed emails service in apiStatus:', error);
    details.processedEmails = { available: false, error: error.message };
    allHealthy = false;
  }

  // Add environment information
  details.environment = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    isRailway: !!process.env.RAILWAY_ENVIRONMENT,
    railwayService: process.env.RAILWAY_SERVICE_NAME || 'unknown'
  };

  return {
    status: allHealthy ? 'connected' : 'degraded',
    message: allHealthy ? 'API is healthy and configured - New Categorization System v2.0' : 'One or more API subsystems have issues or are not configured',
    version: '2.0.0',
    categories: ['Draft Email', 'Invoices', 'Spam', 'Whitelisted Spam'],
    details
  };
} 