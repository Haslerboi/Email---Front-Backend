/**
 * Processed Emails Tracker Service
 * 
 * Keeps track of emails that have already been processed to avoid duplicates
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '../../data');
const PROCESSED_EMAILS_FILE = path.join(STORAGE_DIR, 'processed-emails.json');

let processedEmails = new Set(); // Stores email IDs
let lastCheckTime = null; // Last time we checked for emails

const ensureStorageDirectory = async () => {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Error creating storage directory: ${error.message}`, { tag: 'processedEmails', error: error.stack });
  }
};

const loadProcessedEmailsFromFile = async () => {
  try {
    await ensureStorageDirectory();
    const data = await fs.readFile(PROCESSED_EMAILS_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    
    processedEmails = new Set(jsonData.processedEmails || []);
    lastCheckTime = jsonData.lastCheckTime ? new Date(jsonData.lastCheckTime) : null;
    
    logger.info(`Loaded ${processedEmails.size} processed emails from storage`, { 
      tag: 'processedEmails',
      lastCheckTime: lastCheckTime ? lastCheckTime.toISOString() : 'none'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('No existing processed emails file found, starting fresh', { tag: 'processedEmails' });
      processedEmails = new Set();
      lastCheckTime = new Date(); // Start from now
    } else {
      logger.error(`Error loading processed emails: ${error.message}`, { tag: 'processedEmails', error: error.stack });
      processedEmails = new Set();
      lastCheckTime = new Date();
    }
  }
};

const saveProcessedEmailsToFile = async () => {
  try {
    await ensureStorageDirectory();
    
    // Keep only recent email IDs (last 24 hours worth) to prevent file from growing too large
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const serializedData = {
      processedEmails: Array.from(processedEmails),
      lastCheckTime: new Date().toISOString(),
      cleanupTime: twentyFourHoursAgo.toISOString()
    };
    
    await fs.writeFile(PROCESSED_EMAILS_FILE, JSON.stringify(serializedData, null, 2), 'utf8');
    logger.info(`Saved ${processedEmails.size} processed emails to file`, { tag: 'processedEmails' });
  } catch (error) {
    logger.error(`Error saving processed emails: ${error.message}`, { tag: 'processedEmails', error: error.stack });
  }
};

// Initialize the processed emails from file
loadProcessedEmailsFromFile().catch(error => {
  logger.error(`Initial processed emails loading failed: ${error.message}`, { tag: 'processedEmails' });
});

const ProcessedEmailsService = {
  /**
   * Check if an email has already been processed
   * @param {string} emailId - The Gmail message ID
   * @returns {boolean} - True if already processed
   */
  isProcessed: (emailId) => {
    return processedEmails.has(emailId);
  },

  /**
   * Mark an email as processed
   * @param {string} emailId - The Gmail message ID
   * @returns {Promise<void>}
   */
  markAsProcessed: async (emailId) => {
    if (!processedEmails.has(emailId)) {
      processedEmails.add(emailId);
      await saveProcessedEmailsToFile();
      logger.info(`Marked email as processed: ${emailId}`, { tag: 'processedEmails' });
    }
  },

  /**
   * Get the last check time
   * @returns {Date|null} - Last time emails were checked
   */
  getLastCheckTime: () => {
    return lastCheckTime;
  },

  /**
   * Update the last check time
   * @returns {Promise<void>}
   */
  updateLastCheckTime: async () => {
    lastCheckTime = new Date();
    await saveProcessedEmailsToFile();
  },

  /**
   * Clean up old processed email IDs to prevent memory bloat
   * @returns {Promise<void>}
   */
  cleanup: async () => {
    const initialSize = processedEmails.size;
    
    // For now, just limit to last 1000 emails
    if (processedEmails.size > 1000) {
      const emailArray = Array.from(processedEmails);
      processedEmails = new Set(emailArray.slice(-1000));
      await saveProcessedEmailsToFile();
      
      logger.info(`Cleaned up processed emails: ${initialSize} -> ${processedEmails.size}`, { 
        tag: 'processedEmails' 
      });
    }
  },

  /**
   * Get processing statistics
   * @returns {Object} - Statistics about processed emails
   */
  getStats: () => {
    return {
      totalProcessed: processedEmails.size,
      lastCheckTime: lastCheckTime ? lastCheckTime.toISOString() : null,
      timeSinceLastCheck: lastCheckTime ? Date.now() - lastCheckTime.getTime() : null
    };
  }
};

export default ProcessedEmailsService; 