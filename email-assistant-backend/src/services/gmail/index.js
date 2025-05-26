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
import chrono from 'chrono-node';

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

const fetchUnreadEmails = async (maxResults = 10) => {
  try {
    const gmail = await getGmailClient();
    console.log(`Gmail Service - Fetching unread emails with filtering`);

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -category:promotions -category:social -category:spam',
      maxResults: maxResults * 2
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

    const filteredEmails = emails.filter(email => {
      const sender = email.sender.toLowerCase();
      const senderNameMatch = email.sender.match(/^"?([^<@"]+)"?\s*<[^@]+@[^>]+>$/); // Extracts name if present
      const senderNameExists = senderNameMatch && senderNameMatch[1].trim() !== '';
      const content = `${email.subject} ${email.snippet}`.toLowerCase();
      // Whitelist: Always process these, even if they look automated, as they are critical forms
      const criticalFormSenders = ['no-reply@studioninja.app', 'notifications@pixiesetmail.com', 'form-submission@squarespace.info'];
      if (criticalFormSenders.some(addr => sender.includes(addr))) return true;

      // Blocklist for known transactional/marketing senders that don't need replies
      const businessBlocklist = [
        'orders@triumphanddisaster.com', 
        'service@intl.paypal.com', 
        'marketing@sba.co.nz',
        // Add more known business/marketing emails here
      ];
      if (businessBlocklist.some(addr => sender.includes(addr))) return false;

      // General no-reply patterns
      const noReplyPatterns = ['noreply@', 'no-reply@', 'mailer@', 'auto@', 'notifications@', 'donotreply@', 'automated@'];
      if (noReplyPatterns.some(p => sender.includes(p)) && !senderNameExists) return false;

      // Blocklist for generic domains often used for no-reply/automated emails
      const domainBlocklist = ['@google.com', '@apple.com', '@adobe.com', '@garmin.com', '@ird.govt.nz', '@microsoft.com', '@amazonses.com', '@mailchimp.com', '@salesforce.com', '@sendinblue.com', '@sendgrid.net'];
      if (domainBlocklist.some(d => sender.endsWith(d)) && !senderNameExists) return false;

      // Blocklist for keywords indicating non-essential emails
      const keywordBlocklist = ['receipt', 'invoice', 'newsletter', 'password reset', 'subscription', 'confirm your email', 'account update', 'new login', 'security alert', 'payment confirmation', 'shipping update', 'order confirmation', 'verify your', 'welcome to', 'invitation to', 'activation', 'reminder:', 'weekly update', 'monthly update'];
      if (keywordBlocklist.some(k => content.includes(k)) && !senderNameExists) return false;

      return true; // Default to processing if no exclusionary rules match
    });

    return filteredEmails.slice(0, maxResults);
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
    
    // Log the raw format for debugging
    console.log('Raw email content (first 200 chars):', emailContent.substring(0, 200));
    
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

// Utility to detect and extract availability questions and dates
function extractAvailabilityQuestions(questions) {
  return questions
    .map(q => {
      const date = chrono.parseDate(q);
      if (date && /availab|free|booked|busy|schedule|date|when/i.test(q)) {
        return { question: q, date };
      }
      return null;
    })
    .filter(Boolean);
}

export const checkForNewEmails = async () => {
  logger.info('checkForNewEmails: Starting process.', {tag: 'gmailService'});
  try {
    const emails = await fetchUnreadEmails(5);
    if (!emails || !emails.length) {
      logger.info('checkForNewEmails: No new unread emails to process.', {tag: 'gmailService'});
      return;
    }

    for (const email of emails) {
      logger.info(`Processing New Email: "${email.subject}" from ${email.sender}`, {tag: 'gmailService', emailId: email.id });
      
      // await markAsRead(email.id); // Keep commented for testing if needed, uncomment for production

      const sanitizedEmail = {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject || '[No Subject]',
        body: email.body || '',
        sender: email.sender || '[Unknown Sender]',
        recipient: email.recipient || '',
        date: email.date || new Date().toISOString()
      };
      
      logger.info('Calling Gemini for triage and categorization...', {tag: 'gmailService', emailId: sanitizedEmail.id});
      const geminiResult = await geminiTriageAndCategorize(sanitizedEmail.body);
      logger.info('Gemini Result:', {tag: 'gmailService', emailId: sanitizedEmail.id, geminiResult});

      if (geminiResult.isSpamOrUnimportant) {
        logger.info(`Email "${sanitizedEmail.subject}" marked as spam/unimportant by Gemini. Ending workflow.`, {tag: 'gmailService'});
        await markAsRead(sanitizedEmail.id); // Mark as read if spam/unimportant
        continue; // Move to the next email
      }

      if (geminiResult.needsHumanInput) {
        // Separate availability questions from others
        const allQuestions = geminiResult.questions || [];
        const availabilityQs = extractAvailabilityQuestions(allQuestions);
        const otherQuestions = allQuestions.filter(q => !availabilityQs.some(aq => aq.question === q));
        let availabilityAnswers = [];
        // For each availability question, check calendar and prepare an answer
        for (const { question, date } of availabilityQs) {
          try {
            // Check for the whole day
            const start = new Date(date);
            start.setHours(0,0,0,0);
            const end = new Date(date);
            end.setHours(23,59,59,999);
            const isAvailable = await calendarService.checkAvailability({ start, end });
            availabilityAnswers.push({
              question,
              answer: isAvailable
                ? `Yes, I am available on ${start.toDateString()}.`
                : `Sorry, I am already booked on ${start.toDateString()}.`
            });
          } catch (err) {
            availabilityAnswers.push({
              question,
              answer: "I'm unable to check my calendar right now. Please check back later."
            });
          }
        }
        // If there are other questions, require user input for those
        if (otherQuestions.length > 0) {
          const questionsForTask = otherQuestions.map((qText) => ({
            id: uuidv4(),
            text: qText
          }));
          const taskData = {
            originalEmail: sanitizedEmail,
            questions: questionsForTask,
            category: geminiResult.category,
            status: 'pending_input',
            autoAnswers: availabilityAnswers // store auto-answered availability Qs for later use
          };
          await TaskStateManager.addTask(taskData);
          logger.info(`Task created for email "${sanitizedEmail.subject}" (user input needed for non-availability questions, auto-answered availability questions).`, {tag: 'gmailService'});
        } else if (availabilityAnswers.length > 0) {
          // Only availability questions, auto-draft reply
          const systemGuide = await getGuidanceForCategory(geminiResult.category);
          // Compose a reply using the auto-answers
          const replyText = availabilityAnswers.map(a => a.answer).join('\n');
          const draftResult = await openAIGenerateReply(sanitizedEmail, null, systemGuide + '\n' + replyText);
          if (draftResult && draftResult.replyText) {
            await createDraft(
              sanitizedEmail.threadId,
              sanitizedEmail.sender,
              sanitizedEmail.subject,
              draftResult.replyText
            );
            logger.info(`Auto-drafted reply saved for email "${sanitizedEmail.subject}" (availability only).`, {tag: 'gmailService'});
            await markAsRead(sanitizedEmail.id);
          }
        }
        // If neither, fallback to original logic (should not happen)
      } else { // No human input needed, attempt auto-draft
        logger.info(`Email "${sanitizedEmail.subject}" does not need human input. Attempting auto-draft. Category: ${geminiResult.category}`, {tag: 'gmailService'});
        try {
          const systemGuide = await getGuidanceForCategory(geminiResult.category);
          // Use the original openaiService.generateReply for auto-drafts, passing the guide
          const draftResult = await openAIGenerateReply(sanitizedEmail, null, systemGuide);
          
          if (draftResult && draftResult.replyText) {
          await createDraft(
              sanitizedEmail.threadId,
              sanitizedEmail.sender,
            sanitizedEmail.subject, 
            draftResult.replyText
          );
            logger.info(`Auto-drafted reply saved for email "${sanitizedEmail.subject}" using category '${geminiResult.category}'`, {tag: 'gmailService'});
            await markAsRead(sanitizedEmail.id); // Mark as read after successful auto-draft
          } else {
            logger.warn('Auto-draft generation failed to produce reply text.', {tag: 'gmailService', emailId: sanitizedEmail.id });
            // Optionally, create a task here if auto-draft fails significantly
          }
        } catch (draftError) {
          logger.error('Error during auto-draft process:', {tag: 'gmailService', emailId: sanitizedEmail.id, draftError});
          // Optionally, create a task for manual review if auto-draft errors out
        }
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
  createDraft
};