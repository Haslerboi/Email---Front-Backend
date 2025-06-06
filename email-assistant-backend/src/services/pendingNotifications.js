/**
 * Pending Notifications Service
 * 
 * Tracks notification emails that should be moved to "Notification" folder after 5 minutes
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_DIR = path.join(__dirname, '../../data');
const PENDING_NOTIFICATIONS_FILE = path.join(STORAGE_DIR, 'pending-notifications.json');

let pendingNotifications = new Map(); // Stores email ID -> {emailData, timestamp}

const ensureStorageDirectory = async () => {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    logger.error(`Error creating storage directory: ${error.message}`, { tag: 'pendingNotifications', error: error.stack });
  }
};

const loadPendingNotificationsFromFile = async () => {
  try {
    await ensureStorageDirectory();
    const data = await fs.readFile(PENDING_NOTIFICATIONS_FILE, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Convert array back to Map
    const notificationsArray = jsonData.pendingNotifications || [];
    pendingNotifications = new Map(
      notificationsArray.map(([emailId, data]) => [
        emailId, 
        {
          ...data,
          timestamp: new Date(data.timestamp)
        }
      ])
    );
    
    logger.info(`Loaded ${pendingNotifications.size} pending notifications from storage`, { 
      tag: 'pendingNotifications'
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.info('No existing pending notifications file found, starting fresh', { tag: 'pendingNotifications' });
      pendingNotifications = new Map();
    } else {
      logger.error(`Error loading pending notifications: ${error.message}`, { tag: 'pendingNotifications', error: error.stack });
      pendingNotifications = new Map();
    }
  }
};

const savePendingNotificationsToFile = async () => {
  try {
    await ensureStorageDirectory();
    
    // Convert Map to array for JSON serialization
    const notificationsArray = Array.from(pendingNotifications.entries()).map(([emailId, data]) => [
      emailId,
      {
        ...data,
        timestamp: data.timestamp.toISOString()
      }
    ]);
    
    const serializedData = {
      pendingNotifications: notificationsArray,
      lastSaveTime: new Date().toISOString()
    };
    
    await fs.writeFile(PENDING_NOTIFICATIONS_FILE, JSON.stringify(serializedData, null, 2), 'utf8');
    logger.debug(`Saved ${pendingNotifications.size} pending notifications to file`, { tag: 'pendingNotifications' });
  } catch (error) {
    logger.error(`Error saving pending notifications: ${error.message}`, { tag: 'pendingNotifications', error: error.stack });
  }
};

// Initialize the pending notifications from file
loadPendingNotificationsFromFile().catch(error => {
  logger.error(`Initial pending notifications loading failed: ${error.message}`, { tag: 'pendingNotifications' });
});

const PendingNotificationsService = {
  /**
   * Add a notification email to the pending list (will be moved after 5 minutes)
   * @param {Object} emailData - The email data object
   * @returns {Promise<void>}
   */
  addPendingNotification: async (emailData) => {
    const emailId = emailData.id;
    const notificationData = {
      emailData: emailData,
      timestamp: new Date(),
      subject: emailData.subject,
      sender: emailData.sender
    };
    
    pendingNotifications.set(emailId, notificationData);
    await savePendingNotificationsToFile();
    
    logger.info(`Added pending notification: "${emailData.subject}" from ${emailData.sender}`, { 
      tag: 'pendingNotifications',
      emailId: emailId,
      willMoveAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
  },

  /**
   * Get notifications that are ready to be moved (older than 5 minutes)
   * @returns {Array} - Array of notification data ready to be moved
   */
  getReadyNotifications: () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const readyNotifications = [];
    
    for (const [emailId, data] of pendingNotifications.entries()) {
      if (data.timestamp <= fiveMinutesAgo) {
        readyNotifications.push({
          emailId: emailId,
          ...data
        });
      }
    }
    
    return readyNotifications;
  },

  /**
   * Remove a notification from pending list (after it's been moved)
   * @param {string} emailId - The email ID to remove
   * @returns {Promise<void>}
   */
  removePendingNotification: async (emailId) => {
    if (pendingNotifications.has(emailId)) {
      const data = pendingNotifications.get(emailId);
      pendingNotifications.delete(emailId);
      await savePendingNotificationsToFile();
      
      logger.info(`Removed pending notification: "${data.subject}"`, { 
        tag: 'pendingNotifications',
        emailId: emailId
      });
    }
  },

  /**
   * Get statistics about pending notifications
   * @returns {Object} - Statistics
   */
  getStats: () => {
    const now = new Date();
    const readyCount = PendingNotificationsService.getReadyNotifications().length;
    
    return {
      totalPending: pendingNotifications.size,
      readyToMove: readyCount,
      waitingToMove: pendingNotifications.size - readyCount
    };
  },

  /**
   * Clean up old pending notifications (safety cleanup)
   * @returns {Promise<void>}
   */
  cleanup: async () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const initialSize = pendingNotifications.size;
    
    for (const [emailId, data] of pendingNotifications.entries()) {
      // Remove notifications older than 1 hour (safety cleanup)
      if (data.timestamp <= oneHourAgo) {
        pendingNotifications.delete(emailId);
      }
    }
    
    if (initialSize !== pendingNotifications.size) {
      await savePendingNotificationsToFile();
      logger.info(`Cleaned up old pending notifications: ${initialSize} -> ${pendingNotifications.size}`, { 
        tag: 'pendingNotifications'
      });
    }
  }
};

export default PendingNotificationsService; 