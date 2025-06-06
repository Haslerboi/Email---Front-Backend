// Gmail service for interacting with Gmail API
import { config } from '../../config/env.js';
import { google } from 'googleapis';
import { classifyEmailForPhotographer, generateReply as openAIGenerateReply, generateGuidedReply } from '../openai/index.js';
import { triageAndCategorizeEmail as geminiTriageAndCategorize } from '../geminiService.js';
import { getGuidanceForCategory } from '../templateManager.js';
import TaskStateManager from '../email-state.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../utils/logger.js';
import calendarService from '../calendarService.js';
import * as chrono from 'chrono-node';
import { addWhitelistedSender } from '../whitelistService.js';

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

const fetchUnreadEmails = async (maxResults = 10) => {
  try {
    const gmail = await getGmailClient();
    console.log(`Gmail Service - Fetching unread emails from main inbox only`);

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread in:inbox -category:promotions -category:social -category:spam -category:forums -category:updates',
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
          isRead: !(email.labelIds || []).includes('UNREAD')
        };
      })
    );

          // Additional filtering to exclude promotional emails that might slip through
      const filteredEmails = emails.filter(email => {
        const sender = email.sender.toLowerCase();
        const subject = email.subject.toLowerCase();
        const content = `${subject} ${email.snippet}`.toLowerCase();
        
        // Block obvious promotional senders
        const promotionalPatterns = [
          'newsletter', 'marketing', 'promo', 'hello@', 'info@', 'news@', 
          'updates@', 'team@', 'support@'
        ];
        
        // Block promotional keywords in subject/content
        const promotionalKeywords = [
          'unsubscribe', 'sale', 'discount', 'offer', 'deal', 'shop now',
          'limited time', 'exclusive', 'free shipping', 'newsletter'
        ];
        
        const hasPromotionalSender = promotionalPatterns.some(pattern => sender.includes(pattern));
        const hasPromotionalContent = promotionalKeywords.some(keyword => content.includes(keyword));
        
        if (hasPromotionalSender || hasPromotionalContent) {
          logger.info(`Filtering out promotional email: "${email.subject}" from ${email.sender}`, {
            tag: 'gmailService',
            reason: hasPromotionalSender ? 'promotional sender' : 'promotional content'
          });
          return false;
        }
        
        return true;
      });

      logger.info(`Fetched ${emails.length} emails, filtered to ${filteredEmails.length} legitimate emails`, {
        tag: 'gmailService'
      });
      
      return filteredEmails;
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

export const checkForNewEmails = async () => {
  logger.info('checkForNewEmails: Starting process with new categorization system.', {tag: 'gmailService'});
  try {
    const emails = await fetchUnreadEmails(5);
    if (!emails || !emails.length) {
      logger.info('checkForNewEmails: No new unread emails to process.', {tag: 'gmailService'});
      return;
    }

    for (const email of emails) {
      logger.info(`Processing New Email: "${email.subject}" from ${email.sender}`, {tag: 'gmailService', emailId: email.id });
      
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
        geminiResult = await categorizeEmail(sanitizedEmail.body, sanitizedEmail.sender);
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
          // Double-check that this isn't actually a promotional email
          const emailCheck = `${sanitizedEmail.subject} ${sanitizedEmail.body} ${sanitizedEmail.sender}`.toLowerCase();
          const suspiciousKeywords = ['unsubscribe', 'newsletter', 'marketing', 'promotion', 'sale', 'offer', 'deal'];
          const isSuspicious = suspiciousKeywords.some(keyword => emailCheck.includes(keyword));
          
          if (isSuspicious) {
            logger.warn(`Reclassifying suspicious "Draft Email" as Spam: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
            try {
              await moveToLabel(sanitizedEmail.id, 'Email Prison');
              await markAsRead(sanitizedEmail.id);
              logger.info(`Moved suspicious email to Email Prison`, {tag: 'gmailService'});
            } catch (moveError) {
              logger.error('Error moving suspicious email to spam:', {tag: 'gmailService', error: moveError.message});
            }
            break;
          }
          
          logger.info(`Processing legitimate Draft Email: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
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
              logger.info(`Draft created for email "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
              await markAsRead(sanitizedEmail.id);
            } else {
              logger.warn('Failed to generate draft reply', {tag: 'gmailService', emailId: sanitizedEmail.id});
            }
          } catch (draftError) {
            logger.error('Error processing Draft Email:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: draftError.message});
          }
          break;

        case 'Invoices':
          logger.info(`Moving invoice email to Invoices folder: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            await moveToLabel(sanitizedEmail.id, 'Invoices');
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

        case 'Whitelisted Spam':
          logger.info(`Marking whitelisted spam as read: "${sanitizedEmail.subject}"`, {tag: 'gmailService'});
          try {
            await markAsRead(sanitizedEmail.id);
            logger.info(`Successfully marked whitelisted spam as read`, {tag: 'gmailService'});
          } catch (whitelistError) {
            logger.error('Error processing whitelisted spam:', {tag: 'gmailService', emailId: sanitizedEmail.id, error: whitelistError.message});
          }
          break;

        default:
          logger.warn(`Unknown category "${geminiResult.category}", treating as Draft Email`, {tag: 'gmailService'});
          // Fallback to Draft Email processing
          const systemGuide = await getGuidanceForCategory('Draft Email');
          const draftResult = await openAIGenerateReply(sanitizedEmail, null, systemGuide);
          if (draftResult && draftResult.replyText) {
            await createDraft(sanitizedEmail.threadId, sanitizedEmail.sender, sanitizedEmail.subject, draftResult.replyText);
            await markAsRead(sanitizedEmail.id);
          }
          break;
      }
    }
  } catch (error) {
    logger.error('Error in checkForNewEmails:', {tag: 'gmailService', errorMessage: error.message, stack: error.stack });
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