// Gmail service for interacting with Gmail API
import { config } from '../../config/env.js';
import { google } from 'googleapis';
import { classifyEmailForPhotographer, generateReply as openAIGenerateReply, generateGuidedReply } from '../openai/index.js';
import { categorizeEmail } from '../geminiService.js';
import { getGuidanceForCategory } from '../templateManager.js';
import TaskStateManager from '../email-state.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import calendarService from '../calendarService.js';
import * as chrono from 'chrono-node';
import { addWhitelistedSender } from '../whitelistService.js';
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

/**
 * Fetch emails from a specific label
 * @param {string} labelName - The label name to fetch from
 * @param {number} maxResults - Maximum number of emails to fetch
 * @returns {Promise<Array>} - Array of email objects
 */
const fetchEmailsFromLabel = async (labelName, maxResults = 10) => {
  try {
    const gmail = await getGmailClient();
    const labelId = await getOrCreateLabel(labelName);
    
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      labelIds: [labelId],
      maxResults: maxResults
    });

    const messages = listResponse.data.messages || [];
    if (!messages.length) return [];

    const emails = await Promise.all(
      messages.map(async (message) => {
        const response = await gmail.users.messages.get({ userId: 'me', id: message.id });
        const email = response.data;
        const headers = email.payload.headers;

        const getHeader = (name) => {
          const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
          return header ? header.value : '';
        };

        return {
          id: email.id,
          threadId: email.threadId,
          subject: getHeader('subject'),
          sender: getHeader('from'),
          recipient: getHeader('to'),
          date: getHeader('date'),
          snippet: email.snippet,
          labels: email.labelIds || []
        };
      })
    );

    return emails;
  } catch (error) {
    logger.error(`Error fetching emails from label ${labelName}:`, { error: error.message, tag: 'gmailService' });
    throw new Error(`Failed to fetch emails from label: ${error.message}`);
  }
};

/**
 * Move an email back to inbox and mark as read
 * @param {string} messageId - The message ID to move back
 * @param {string} fromLabelName - The label to remove the email from
 * @returns {Promise<void>}
 */
const moveBackToInbox = async (messageId, fromLabelName) => {
  try {
    const gmail = await getGmailClient();
    const labelId = await getOrCreateLabel(fromLabelName);
    
    // Add INBOX label, remove the source label, and mark as read
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['INBOX'],
        removeLabelIds: [labelId, 'UNREAD']
      }
    });
    
    logger.info(`Moved email ${messageId} back to inbox from ${fromLabelName} and marked as read`, { tag: 'gmailService' });
  } catch (error) {
    logger.error(`Error moving email ${messageId} back to inbox:`, { error: error.message, tag: 'gmailService' });
    throw new Error(`Failed to move email back to inbox: ${error.message}`);
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
          date: getHeader('date'),
          snippet: email.snippet,
          body: decodedBody,
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
 * Create a draft reply to an email
 * @param {string} threadId - The thread ID to reply to
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} messageText - Email body content
 * @returns {Promise<Object>} - Created draft data
 */
const createDraft = async (threadId, to, subject, messageText) => {
  try {
    console.log(`Creating draft for thread: ${threadId}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message length: ${messageText.length} chars`);
    
    if (!threadId) {
      console.error('No threadId provided to createDraft');
      throw new Error('ThreadId is required for creating a draft');
    }
    
    if (!to) {
      console.error('No recipient (to) provided to createDraft');
      throw new Error('Recipient email is required for creating a draft');
    }
    
    const gmail = await getGmailClient();
    console.log('Gmail client created successfully');
    
    // Ensure subject has Re: prefix if not already present
    const fullSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
    
    // Construct email content
    const emailContent = [
      `To: ${to}`,
      `Subject: ${fullSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      messageText
    ].join('\r\n');
    
    console.log('Email content constructed, preparing to create draft');
    
    // Create the draft
    console.log('Sending draft creation request to Gmail API...');
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          threadId,
          raw: Buffer.from(emailContent).toString('base64url')
        }
      }
    });
    
    if (!response || !response.data) {
      console.error('Empty response from Gmail API draft creation');
      throw new Error('Failed to create draft: Empty response from Gmail API');
    }
    
    console.log(`✅ Draft created successfully with ID: ${response.data.id || 'unknown'}`);
    console.log(`Draft created: "${fullSubject}" for thread ${threadId}`);
    return response.data;
  } catch (error) {
    console.error('❌ Error creating draft:', error);
    console.error('Error details:', error.stack || error);
    throw new Error(`Failed to create draft: ${error.message}`);
  }
};

/**
 * Check for new emails in the 'white' label and process them for whitelisting
 */
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

export const checkWhiteLabelForUpdates = async () => {
  logger.info('Checking white label for new emails to whitelist...', { tag: 'gmailService' });
  try {
    const whiteEmails = await fetchEmailsFromLabel('white', 20);
    
    if (!whiteEmails || !whiteEmails.length) {
      logger.info('No emails found in white label', { tag: 'gmailService' });
      return;
    }

    for (const email of whiteEmails) {
      logger.info(`Processing email from white label: ${email.sender}`, { tag: 'gmailService' });
      
      try {
        // Add sender to whitelist
        await addWhitelistedSender(email.sender);
        
        // Move email back to inbox and mark as read
        await moveBackToInbox(email.id, 'white');
        
        logger.info(`Successfully processed white label email from ${email.sender}`, { tag: 'gmailService' });
      } catch (emailError) {
        logger.error(`Error processing individual email from white label:`, { 
          emailId: email.id, 
          sender: email.sender,
          error: emailError.message,
          tag: 'gmailService' 
        });
      }
    }
  } catch (error) {
    // Don't log as error if it's just that the white label doesn't exist yet
    if (error.message.includes('Failed to get/create label white')) {
      logger.info('White label does not exist yet, will be created when first email is added', { tag: 'gmailService' });
    } else {
      logger.error('Error processing white label emails:', { 
        error: error.message, 
        stack: error.stack,
        tag: 'gmailService' 
      });
    }
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
        date: email.date || new Date().toISOString()
      };
      
      logger.info('Calling Gemini for email categorization...', {tag: 'gmailService', emailId: sanitizedEmail.id});
      let geminiResult;
      try {
        geminiResult = await categorizeEmail(sanitizedEmail.body, sanitizedEmail.sender, sanitizedEmail.subject);
        logger.info('Gemini categorization result:', {tag: 'gmailService', emailId: sanitizedEmail.id, category: geminiResult.category});
      } catch (categorizationError) {
        logger.error('Failed to categorize email, using fallback:', {
          tag: 'gmailService', 
          emailId: sanitizedEmail.id,
          error: categorizationError.message,
          stack: categorizationError.stack
        });
        // Fallback to Draft Email for safety
        geminiResult = {
          category: 'Draft Email',
          reasoning: 'Categorization failed, treating as Draft Email for safety'
        };
      }

      // Process based on category
      switch (geminiResult.category) {
        case 'Draft Email':
          logger.info(`Processing Draft Email: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            // Get system guide for draft emails
            const systemGuide = await getGuidanceForCategory('Draft Email');
            
            // Generate reply using OpenAI
            const draftResult = await openAIGenerateReply(sanitizedEmail, null, systemGuide);
            
            if (draftResult && draftResult.replyText) {
              // Create draft in Gmail
              await createDraft(
                sanitizedEmail.threadId,
                sanitizedEmail.sender,
                sanitizedEmail.subject,
                draftResult.replyText
              );
              logger.info(`Draft created for email "${sanitizedEmail.subject}" - keeping original email unread for user review`, {tag: 'gmailService'});
              // NOTE: Intentionally NOT marking as read so user can see the original email
              // The email is already marked as processed to prevent duplicate drafts
            } else {
              logger.warn('Failed to generate draft reply - keeping email unread for manual handling', {tag: 'gmailService', emailId: sanitizedEmail.id});
              // NOTE: Not marking as read so user can handle manually
            }
          } catch (draftError) {
            logger.error('Error processing Draft Email - keeping unread for manual handling:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: draftError.message});
            // NOTE: Not marking as read so user can handle the error case manually
          }
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

        case 'Whitelisted Spam':
          logger.info(`Marking whitelisted spam as read: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            await markAsRead(sanitizedEmail.id);
            logger.info(`Successfully marked whitelisted spam as read`, {tag: 'gmailService'});
          } catch (whitelistError) {
            logger.error('Error marking whitelisted spam as read:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: whitelistError.message});
          }
          break;

        default:
          logger.warn(`Unknown category "${geminiResult.category}", treating as Draft Email`, {tag: 'gmailService'});
          // Fallback to Draft Email processing
          try {
            const systemGuide = await getGuidanceForCategory('Draft Email');
            const draftResult = await openAIGenerateReply(sanitizedEmail, null, systemGuide);
            if (draftResult && draftResult.replyText) {
              await createDraft(sanitizedEmail.threadId, sanitizedEmail.sender, sanitizedEmail.subject, draftResult.replyText);
              logger.info(`Draft created for unknown category email - keeping unread for user review`, {tag: 'gmailService'});
            }
            // NOTE: Not marking as read so user can see and handle unknown category emails
          } catch (defaultError) {
            logger.error('Error in default case processing - keeping unread for manual handling:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: defaultError.message});
            // NOTE: Not marking as read so user can handle the error case manually
          }
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
  createDraft,
  getOrCreateLabel,
  moveToLabel,
  fetchEmailsFromLabel,
  moveBackToInbox
};