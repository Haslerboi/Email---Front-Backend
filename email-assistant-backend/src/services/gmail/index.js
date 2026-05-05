// Gmail service for interacting with Gmail API
import { config } from '../../config/env.js';
import { google } from 'googleapis';
import { categorizeEmail } from '../geminiService.js';
import logger from '../../utils/logger.js';
import ProcessedEmailsService from '../processedEmails.js';
import PendingNotificationsService from '../pendingNotifications.js';

const createOAuth2Client = async () => {
  try {
    console.log('Creating Gmail OAuth2 client with credentials');
    const oAuth2Client = new google.auth.OAuth2(
      config.gmail.clientId,
      config.gmail.clientSecret,
      config.gmail.redirectUri
    );
    oAuth2Client.setCredentials({ refresh_token: config.gmail.refreshToken });
    return oAuth2Client;
  } catch (error) {
    console.error('Error creating OAuth2 client:', error);
    throw new Error('Failed to create OAuth2 client: ' + error.message);
  }
};

const getGmailClient = async () => {
  try {
    const auth = await createOAuth2Client();
    return google.gmail({ version: 'v1', auth });
  } catch (error) {
    console.error('Error getting Gmail client:', error);
    throw new Error('Failed to get Gmail client: ' + error.message);
  }
};

/**
 * Get or create a Gmail label
 * @param {string} labelName - The name of the label to get or create
 * @returns {Promise<string>} - The label ID
 */
const getOrCreateLabel = async (labelName) => {
  try {
    const gmail = await getGmailClient();
    
    // First, try to find existing label
    const labelsResponse = await gmail.users.labels.list({ userId: 'me' });
    const existingLabel = labelsResponse.data.labels.find(label => label.name === labelName);
    
    if (existingLabel) {
      logger.info(`Found existing label: ${labelName} (ID: ${existingLabel.id})`, { tag: 'gmailService' });
      return existingLabel.id;
    }
    
    // Create new label if it doesn't exist
    const createResponse = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show'
      }
    });
    
    logger.info(`Created new label: ${labelName} (ID: ${createResponse.data.id})`, { tag: 'gmailService' });
    return createResponse.data.id;
  } catch (error) {
    logger.error(`Error getting/creating label ${labelName}:`, { 
      error: error.message, 
      stack: error.stack,
      tag: 'gmailService' 
    });
    throw new Error(`Failed to get/create label ${labelName}: ${error.message}`);
  }
};

/**
 * Move an email to a specific label/folder
 * @param {string} messageId - The message ID to move
 * @param {string} labelName - The label name to move to
 * @returns {Promise<void>}
 */
const moveToLabel = async (messageId, labelName) => {
  try {
    const gmail = await getGmailClient();
    const labelId = await getOrCreateLabel(labelName);
    
    // Add the target label and remove INBOX label
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
        removeLabelIds: ['INBOX']
      }
    });
    
    logger.info(`Moved email ${messageId} to label: ${labelName}`, { tag: 'gmailService' });
  } catch (error) {
    logger.error(`Error moving email ${messageId} to label ${labelName}:`, { error: error.message, tag: 'gmailService' });
    throw new Error(`Failed to move email to label: ${error.message}`);
  }
};

const fetchUnreadEmails = async (maxResults = 5, newerThanMinutes = 5) => {
  try {
    const gmail = await getGmailClient();
    
    // Calculate timestamp for emails newer than X minutes ago
    const newerThanTime = new Date();
    newerThanTime.setMinutes(newerThanTime.getMinutes() - newerThanMinutes);
    const newerThanTimestamp = Math.floor(newerThanTime.getTime() / 1000);
    
    console.log(`Gmail Service - Fetching emails newer than ${newerThanMinutes} minutes from primary inbox (excluding promotions/social only)`);
    
    // Use Unix timestamp for more precise filtering
    const afterTimestamp = Math.floor(newerThanTime.getTime() / 1000);
    console.log(`Using after:${afterTimestamp} for emails newer than ${newerThanTime.toISOString()}`);

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread in:inbox -category:promotions -category:social after:${afterTimestamp}`,
      maxResults: maxResults
    });

    const messages = listResponse.data.messages || [];
    if (!messages.length) {
      console.log(`Gmail API returned 0 messages for query: after:${afterTimestamp}`);
      return [];
    }

    console.log(`Gmail API returned ${messages.length} messages (expected: emails newer than ${newerThanTime.toISOString()}), fetching full data...`);

    const emails = await Promise.all(
      messages.map(async (message) => {
        const response = await gmail.users.messages.get({ userId: 'me', id: message.id });
        const email = response.data;
        const headers = email.payload.headers;

        const getHeader = (name) => {
          const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
          return header ? header.value : '';
        };

        // Extract all headers for categorization context
        const allHeaders = {};
        headers.forEach(header => {
          allHeaders[header.name.toLowerCase()] = header.value;
        });

        let decodedBody = email.snippet;
        if (email.payload.body?.data) {
          decodedBody = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
        } else if (email.payload.parts) {
          const textPart = email.payload.parts.find(part => part.mimeType === 'text/plain' || part.mimeType === 'text/html');
          if (textPart?.body?.data) {
            decodedBody = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
          }
        }

        return {
          id: email.id,
          threadId: email.threadId,
          subject: getHeader('subject'),
          sender: getHeader('from'),
          recipient: getHeader('to'),
          replyTo: getHeader('reply-to'),
          date: getHeader('date'),
          snippet: email.snippet,
          body: decodedBody,
          headers: allHeaders, // Include all headers for categorization
          labels: email.labelIds || [],
          isRead: !(email.labelIds || []).includes('UNREAD'),
          internalDate: new Date(parseInt(email.internalDate)) // Gmail's internal timestamp
        };
      })
    );

      // Additional client-side date filtering to ensure we only process recent emails
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - newerThanMinutes);
      
      const recentEmails = emails.filter(email => {
        const emailDate = email.internalDate || new Date(email.date);
        const isRecent = emailDate > cutoffTime;
        
        if (!isRecent) {
          logger.warn(`Filtering out old email: "${email.subject}" from ${email.sender} (Date: ${emailDate.toISOString()}, Cutoff: ${cutoffTime.toISOString()})`, {
            tag: 'gmailService',
            emailId: email.id,
            emailDate: emailDate.toISOString(),
            cutoffTime: cutoffTime.toISOString()
          });
        }
        
        return isRecent;
      });

      // Log the efficiency of Gmail's server-side filtering
      const filteredOutCount = emails.length - recentEmails.length;
      if (filteredOutCount > 0) {
        logger.warn(`Gmail server-side filtering inefficient: returned ${emails.length} emails, had to filter out ${filteredOutCount} old emails client-side`, {
          tag: 'gmailService',
          gmailReturnedCount: emails.length,
          clientFilteredCount: filteredOutCount,
          finalCount: recentEmails.length,
          cutoffTime: cutoffTime.toISOString()
        });
      } else {
        logger.info(`Gmail filtering efficient: returned ${emails.length} emails, all were recent (newer than ${newerThanMinutes} minutes)`, {
          tag: 'gmailService',
          cutoffTime: cutoffTime.toISOString()
        });
      }
      
      return recentEmails;
    } catch (error) {
      console.error('Error in Gmail service:', error);
      throw new Error('Failed to fetch emails: ' + error.message);
    }
  };

const markAsRead = async (messageId) => {
  try {
    const gmail = await getGmailClient();
    const response = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'], addLabelIds: [] }
    });
    return response.data;
  } catch (error) {
    console.error(`Error marking email ${messageId} as read:`, error);
    throw new Error(`Failed to mark email as read: ${error.message}`);
  }
};

/**
 * Process pending notifications and move ones that are ready (older than 5 minutes)
 */
export const processPendingNotifications = async () => {
  logger.debug('Checking for pending notifications ready to be moved...', { tag: 'gmailService' });
  try {
    const readyNotifications = PendingNotificationsService.getReadyNotifications();
    
    if (!readyNotifications || !readyNotifications.length) {
      logger.debug('No pending notifications ready to be moved', { tag: 'gmailService' });
      return;
    }

    logger.info(`Found ${readyNotifications.length} notifications ready to be moved to Notification folder`, { tag: 'gmailService' });

    for (const notification of readyNotifications) {
      const { emailId, emailData } = notification;
      
      try {
        logger.info(`Moving notification to Notification folder: "${emailData.subject}" from ${emailData.sender}`, {
          tag: 'gmailService',
          emailId: emailId
        });
        
        // Move email to Notification label and mark as read
        await moveToLabel(emailId, 'Notification');
        await markAsRead(emailId);
        
        // Remove from pending notifications list
        await PendingNotificationsService.removePendingNotification(emailId);
        
        logger.info(`Successfully moved notification to Notification folder: "${emailData.subject}"`, {
          tag: 'gmailService',
          emailId: emailId
        });
        
      } catch (moveError) {
        logger.error(`Error moving notification ${emailId}:`, { 
          tag: 'gmailService',
          emailId: emailId,
          subject: emailData.subject,
          error: moveError.message,
          stack: moveError.stack
        });
      }
    }
    
    // Clean up old pending notifications
    await PendingNotificationsService.cleanup();
    
  } catch (error) {
    logger.error('Error processing pending notifications:', { 
      tag: 'gmailService',
      error: error.message,
      stack: error.stack
    });
  }
};

// Add processing lock to prevent overlapping checks
let isProcessingEmails = false;

export const checkForNewEmails = async () => {
  if (isProcessingEmails) {
    logger.warn('Email processing already in progress, skipping this check', {tag: 'gmailService'});
    return;
  }
  
  isProcessingEmails = true;
  logger.info('checkForNewEmails: Starting process with new categorization system.', {tag: 'gmailService'});
  
  try {
    // Fetch emails newer than 5 minutes to avoid reprocessing old emails
    const emails = await fetchUnreadEmails(3, 5); // Reduced from 5 to 3 for efficiency
    if (!emails || !emails.length) {
      logger.info('checkForNewEmails: No new unread emails to process.', {tag: 'gmailService'});
      return;
    }

    // Filter out emails that have already been processed
    const newEmails = emails.filter(email => {
      const isProcessed = ProcessedEmailsService.isProcessed(email.id);
      if (isProcessed) {
        const emailDate = email.internalDate || new Date(email.date);
        const ageMinutes = Math.round((Date.now() - emailDate.getTime()) / (1000 * 60));
        logger.debug(`Skipping already processed email: "${email.subject}" (Age: ${ageMinutes} minutes)`, {
          tag: 'gmailService',
          emailId: email.id,
          ageMinutes: ageMinutes
        });
      }
      return !isProcessed;
    });
    
    if (newEmails.length === 0) {
      logger.info(`checkForNewEmails: Found ${emails.length} emails but all were already processed.`, {tag: 'gmailService'});
      return;
    }
    
    logger.info(`checkForNewEmails: Processing ${newEmails.length} new emails (filtered from ${emails.length} total)`, {tag: 'gmailService'});

    for (const email of newEmails) {
      const emailDate = email.internalDate || new Date(email.date);
      const ageMinutes = Math.round((Date.now() - emailDate.getTime()) / (1000 * 60));
      
      logger.info(`Processing New Email: "${email.subject}" from ${email.sender} (Age: ${ageMinutes} minutes, Date: ${emailDate.toISOString()})`, {
        tag: 'gmailService', 
        emailId: email.id,
        emailDate: emailDate.toISOString(),
        ageMinutes: ageMinutes
      });
      
      // Mark as processed immediately to prevent duplicate processing
      await ProcessedEmailsService.markAsProcessed(email.id);
      
      // Note: We'll mark as read later based on the category
      // Notifications need to stay unread in inbox for 5 minutes
      
      const sanitizedEmail = {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject || '[No Subject]',
        body: email.body || '',
        sender: email.sender || '[Unknown Sender]',
        recipient: email.recipient || '',
        headers: email.headers || {},
        date: email.date || new Date().toISOString()
      };
      
      logger.info('Calling OpenAI (gpt-5.4-mini) for email categorization...', {tag: 'gmailService', emailId: sanitizedEmail.id});
      let geminiResult;
      try {
        geminiResult = await categorizeEmail(sanitizedEmail.body, sanitizedEmail.sender, sanitizedEmail.subject, sanitizedEmail.headers);
        logger.info('Categorization result (OpenAI):', {tag: 'gmailService', emailId: sanitizedEmail.id, category: geminiResult.category});
      } catch (categorizationError) {
        logger.error('Failed to categorize email, using fallback:', {
          tag: 'gmailService', 
          emailId: sanitizedEmail.id,
          error: categorizationError.message,
          stack: categorizationError.stack
        });
        // Fallback to Reply Needed for safety
        geminiResult = {
          category: 'Reply Needed',
          reasoning: 'Categorization failed, treating as Reply Needed for safety'
        };
      }

      // Process based on category
      switch (geminiResult.category) {
        case 'Reply Needed':
          logger.info(
            `Processing Reply Needed: "${sanitizedEmail.subject}" - leaving unread in inbox`,
            { tag: 'gmailService', emailId: sanitizedEmail.id }
          );
          break;

        case 'Invoices':
          logger.info(`Moving invoice email to Invoices folder: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            await moveToLabel(sanitizedEmail.id, 'Invoices');
            await markAsRead(sanitizedEmail.id);
            logger.info(`Successfully moved invoice email to Invoices folder`, {tag: 'gmailService'});
          } catch (invoiceError) {
            logger.error('Error moving invoice email:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: invoiceError.message});
          }
          break;

        case 'Spam':
          logger.info(`Moving spam email to Email Prison: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            await moveToLabel(sanitizedEmail.id, 'Email Prison');
            await markAsRead(sanitizedEmail.id);
            logger.info(`Successfully moved spam email to Email Prison`, {tag: 'gmailService'});
          } catch (spamError) {
            logger.error('Error moving spam email:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: spamError.message});
          }
          break;

        case 'Notifications':
          logger.info(`Adding notification to pending list: "${sanitizedEmail.subject}" from ${sanitizedEmail.sender}`, {tag: 'gmailService'});
          try {
            // Add to pending notifications (will be moved after 5 minutes)
            await PendingNotificationsService.addPendingNotification(sanitizedEmail);
            // Don't mark as read yet - keep in inbox for 5 minutes
            logger.info(`Successfully added notification to pending list`, {tag: 'gmailService'});
          } catch (notificationError) {
            logger.error('Error adding notification to pending list:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: notificationError.message});
          }
          break;

        default:
          logger.warn(
            `Unknown category "${geminiResult.category}". Leaving unread in inbox for manual review.`,
            { tag: 'gmailService', emailId: sanitizedEmail.id }
          );
          break;
      }
    }
  } catch (error) {
    logger.error('Error in checkForNewEmails:', {tag: 'gmailService', errorMessage: error.message, stack: error.stack });
  } finally {
    isProcessingEmails = false;
  }
  logger.info('checkForNewEmails: Finished process.', {tag: 'gmailService'});
};

export {
  createOAuth2Client,
  getGmailClient,
  fetchUnreadEmails,
  markAsRead,
  getOrCreateLabel,
  moveToLabel
};