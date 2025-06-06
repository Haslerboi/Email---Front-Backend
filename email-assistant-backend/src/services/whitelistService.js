/**
 * Whitelist Service
 * 
 * Manages whitelisted spam senders and persists them to a JSON file.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '../../data');
const WHITELIST_STORAGE_FILE = path.join(STORAGE_DIR, 'whitelisted-senders.json');

let whitelistedSenders = new Set(); // Stores email addresses

const ensureStorageDirectory = async () => {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Error creating storage directory: ${error.message}`, { tag: 'whitelistService', error: error.stack });
  }
};

const loadWhitelistFromFile = async () => {
  try {
    await ensureStorageDirectory();
    const data = await fs.readFile(WHITELIST_STORAGE_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    whitelistedSenders = new Set(jsonData);
    logger.info(`Loaded ${whitelistedSenders.size} whitelisted senders from storage`, { tag: 'whitelistService' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('No existing whitelist file found, starting fresh', { tag: 'whitelistService' });
      whitelistedSenders = new Set();
    } else {
      logger.error(`Error loading whitelist: ${error.message}`, { tag: 'whitelistService', error: error.stack });
      whitelistedSenders = new Set();
    }
  }
};

const saveWhitelistToFile = async () => {
  try {
    await ensureStorageDirectory();
    const serializedData = Array.from(whitelistedSenders);
    await fs.writeFile(WHITELIST_STORAGE_FILE, JSON.stringify(serializedData, null, 2), 'utf8');
    logger.info(`Saved ${whitelistedSenders.size} whitelisted senders to file`, { tag: 'whitelistService' });
  } catch (error) {
    logger.error(`Error saving whitelist: ${error.message}`, { tag: 'whitelistService', error: error.stack });
  }
};

// Initialize the whitelist from file
loadWhitelistFromFile().catch(error => {
  logger.error(`Initial whitelist loading failed: ${error.message}`, { tag: 'whitelistService' });
});

/**
 * Extract email address from a sender string
 * @param {string} senderString - The sender string (e.g., "Name <email@domain.com>" or "email@domain.com")
 * @returns {string} - The extracted email address
 */
const extractEmailAddress = (senderString) => {
  if (!senderString) return '';
  
  // Check if it's in the format "Name <email@domain.com>"
  const emailMatch = senderString.match(/<([^>]+)>/);
  if (emailMatch) {
    return emailMatch[1].toLowerCase().trim();
  }
  
  // Otherwise, assume it's just the email address
  return senderString.toLowerCase().trim();
};

const WhitelistService = {
  /**
   * Add a sender to the whitelist
   * @param {string} senderString - The sender string to whitelist
   * @returns {Promise<boolean>} - True if added, false if already existed
   */
  addSender: async (senderString) => {
    const emailAddress = extractEmailAddress(senderString);
    if (!emailAddress) {
      logger.warn('Attempted to add invalid sender to whitelist', { tag: 'whitelistService', senderString });
      return false;
    }
    
    if (whitelistedSenders.has(emailAddress)) {
      logger.info(`Sender ${emailAddress} already in whitelist`, { tag: 'whitelistService' });
      return false;
    }
    
    whitelistedSenders.add(emailAddress);
    logger.info(`Added sender to whitelist: ${emailAddress}`, { tag: 'whitelistService' });
    await saveWhitelistToFile();
    return true;
  },

  /**
   * Check if a sender is whitelisted
   * @param {string} senderString - The sender string to check
   * @returns {Promise<boolean>} - True if whitelisted
   */
  isWhitelisted: async (senderString) => {
    const emailAddress = extractEmailAddress(senderString);
    return whitelistedSenders.has(emailAddress);
  },

  /**
   * Remove a sender from the whitelist
   * @param {string} senderString - The sender string to remove
   * @returns {Promise<boolean>} - True if removed, false if didn't exist
   */
  removeSender: async (senderString) => {
    const emailAddress = extractEmailAddress(senderString);
    if (whitelistedSenders.has(emailAddress)) {
      whitelistedSenders.delete(emailAddress);
      logger.info(`Removed sender from whitelist: ${emailAddress}`, { tag: 'whitelistService' });
      await saveWhitelistToFile();
      return true;
    }
    return false;
  },

  /**
   * Get all whitelisted senders
   * @returns {Array<string>} - Array of whitelisted email addresses
   */
  getAllSenders: () => {
    return Array.from(whitelistedSenders);
  },

  /**
   * Clear all whitelisted senders
   * @returns {Promise<void>}
   */
  clearAll: async () => {
    whitelistedSenders.clear();
    logger.info('Cleared all whitelisted senders', { tag: 'whitelistService' });
    await saveWhitelistToFile();
  }
};

// Export individual functions for easy importing
export const addWhitelistedSender = WhitelistService.addSender;
export const isWhitelistedSpamSender = WhitelistService.isWhitelisted;
export const removeWhitelistedSender = WhitelistService.removeSender;
export const getAllWhitelistedSenders = WhitelistService.getAllSenders;
export const clearAllWhitelistedSenders = WhitelistService.clearAll;

export default WhitelistService; 