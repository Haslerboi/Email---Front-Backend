// Gmail service for interacting with Gmail API
import { config } from '../../config/env.js';
import { google } from 'googleapis';
import { classifyEmail, classifyEmailForPhotographer, generateReply } from '../openai/index.js';
import { sendTelegramMessage } from '../telegram/index.js';

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
      const content = `${email.subject} ${email.snippet}`.toLowerCase();
      const whitelist = ['no-reply@studioninja.app', 'notifications@pixiesetmail.com', 'form-submission@squarespace.info'];
      if (whitelist.some(addr => sender.includes(addr))) return true;

      const noReplyPatterns = ['noreply@', 'no-reply@', 'mailer@', 'auto@', 'notifications@', 'donotreply@', 'automated@'];
      if (noReplyPatterns.some(p => sender.includes(p))) return false;

      const domains = ['@google.com', '@apple.com', '@adobe.com', '@garmin.com', '@ird.govt.nz', '@microsoft.com', '@amazonses.com', '@mailchimp.com', '@salesforce.com', '@sendinblue.com', '@sendgrid.net'];
      if (domains.some(d => sender.endsWith(d))) return false;

      const keywords = ['receipt', 'invoice', 'newsletter', 'password reset', 'subscription', 'confirm your email', 'account update', 'new login', 'security alert', 'payment confirmation', 'shipping update', 'order confirmation', 'verify your', 'welcome to', 'invitation to', 'activation', 'reminder:', 'weekly update', 'monthly update'];
      if (keywords.some(k => content.includes(k))) return false;

      return true;
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

const checkForNewEmails = async () => {
  try {
    const emails = await fetchUnreadEmails(5);
    if (!emails.length) return;

    for (const email of emails) {
      console.log(`📩 New Email: "${email.subject}" from ${email.sender}`);
      await markAsRead(email.id);

      // Debug log to check email object fields
      console.log('Email object being passed to classifyEmailForPhotographer:', {
        subject: email.subject,
        body: email.body ? email.body.substring(0, 100) + '...' : null,
        sender: email.sender
      });

      // Ensure required fields are present
      const sanitizedEmail = {
        subject: email.subject || '[No Subject]',
        body: email.body || '',
        sender: email.sender || '[Unknown Sender]'
      };
      
      // Log if any fields were missing
      if (!email.subject || !email.body || !email.sender) {
        console.error('Missing required email fields:', {
          hasSubject: !!email.subject,
          hasBody: !!email.body,
          hasSender: !!email.sender
        });
      }
        
      // Use photographer-specific classification instead of generic classification
      const classificationResult = await classifyEmailForPhotographer(sanitizedEmail.body);
      console.log(`Email classified as: ${classificationResult.classification} with ${classificationResult.questions?.length || 0} questions`);
      
      if (classificationResult.classification === 'auto_draft') {
        console.log('🤖 AUTO-DRAFT: Starting automatic reply generation for:', sanitizedEmail.subject);
        try {
          // Debug: Check OpenAI API key
          console.log('OpenAI API key available:', !!config.openai.apiKey);
          
          // Generate reply automatically
          console.log('Calling OpenAI API to generate reply...');
          const draftResult = await generateReply(sanitizedEmail);
          console.log('Reply generated successfully, length:', draftResult.replyText.length);
          
          // Save as draft in Gmail
          console.log('Creating Gmail draft with threadId:', email.threadId);
          await createDraft(
            email.threadId, 
            email.sender, 
            sanitizedEmail.subject, 
            draftResult.replyText
          );
          
          console.log(`✅ Auto-drafted reply saved for email "${sanitizedEmail.subject}"`);
          // No Telegram notification for auto-drafted emails
        } catch (draftError) {
          console.error('❌ Error creating automatic draft:', draftError);
          console.error('Error details:', draftError.stack || draftError);
          
          // If auto-drafting fails, notify via Telegram
          await sendTelegramMessage({
            to: config.telegram.chatId,
            email: sanitizedEmail,
            questions: [],
            action: `Failed to create draft: ${draftError.message}`,
            classification: 'error'
          });
        }
      } else {
        console.log('👤 NEEDS INPUT: Email requires human input');
        // Only send Telegram notification for emails that need input
        await sendTelegramMessage({
          to: config.telegram.chatId,
          email: sanitizedEmail,
          questions: classificationResult.questions || [],
          action: 'Needs your input',
          classification: 'needs_input'
        });
      }
    }
  } catch (error) {
    console.error('❌ Error in checkForNewEmails:', error.message);
    console.error('Error stack:', error.stack);
  }
};

export {
  createOAuth2Client,
  getGmailClient,
  fetchUnreadEmails,
  markAsRead,
  createDraft,
  checkForNewEmails
};