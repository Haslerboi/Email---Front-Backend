// Gmail service for interacting with Gmail API
import { config } from '../../config/env.js';
import { google } from 'googleapis';
import { classifyEmailForPhotographer, generateReply } from '../openai/index.js';
import TaskStateManager from '../email-state.js';
import { v4 as uuidv4 } from 'uuid';

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
    // --- TEMPORARY TEST CODE REMOVED ---
    // const emails = [
    //   {
    //     id: 'testEmail123',
    //     threadId: 'testThread456',
    //     subject: 'Test Inquiry for Task Creation',
    //     sender: 'tester@example.com',
    //     recipient: 'me@example.com',
    //     date: new Date().toISOString(),
    //     body: 'This is a test email body. What is the primary color? And what is the capital of France?'
    //   }
    // ];
    // --- TEMPORARY TEST CODE END ---
    
    const emails = await fetchUnreadEmails(5); // Restored original line
    if (!emails || !emails.length) { 
        console.log('No new unread emails to process.'); // Updated log
        return;
    }

    for (const email of emails) {
      console.log(`📩 Processing New Email: "${email.subject}" from ${email.sender}`);
      
      await markAsRead(email.id); // Ensure this is UNCOMMENTED for normal operation

      const sanitizedEmail = {
        id: email.id,
        threadId: email.threadId,
        subject: email.subject || '[No Subject]',
        body: email.body || '',
        sender: email.sender || '[Unknown Sender]',
        recipient: email.recipient || '',
        date: email.date || new Date().toISOString()
      };
      
      // --- TEMPORARY CLASSIFICATION REMOVED ---
      // const classificationResult = {
      //   classification: 'needs_input', 
      //   questions: ['What is your favorite color?', 'What is the capital of ImaginaryLand?'],
      //   draftTemplate: 'Dear {{senderName}},...Assistant'
      // };
      const classificationResult = await classifyEmailForPhotographer(sanitizedEmail.body); // Restored OpenAI call
      console.log(`Email classified as: ${classificationResult.classification} with ${classificationResult.questions?.length || 0} questions`);
      // --- END TEMPORARY CLASSIFICATION ---
      
      if (classificationResult.classification === 'auto_draft') {
        console.log('🤖 AUTO-DRAFT: Starting automatic reply generation for:', sanitizedEmail.subject);
        try {
          const draftResult = await generateReply(sanitizedEmail);
          await createDraft(
            email.threadId, 
            email.sender, 
            sanitizedEmail.subject, 
            draftResult.replyText
          );
          console.log(`✅ Auto-drafted reply saved for email "${sanitizedEmail.subject}"`);
        } catch (draftError) {
          console.error('❌ Error creating automatic draft:', draftError);
          // Consider creating a task here if auto-draft fails, e.g.:
          // classificationResult.classification = 'needs_input'; // Force to needs_input path
          // classificationResult.questions = ["Review original email and failed auto-draft attempt."];
        }
      } 
      // Ensure there's an explicit check for 'needs_input' or a default else that leads here
      if (classificationResult.classification === 'needs_input') { // Explicitly check for 'needs_input'
        console.log('👤 NEEDS INPUT: Email requires human input, creating task.');
        
        const questionsForTask = (classificationResult.questions || []).map((qText, index) => ({
          id: uuidv4(), 
          text: qText
        }));

        const taskData = {
          originalEmail: sanitizedEmail,
          questions: questionsForTask,
          draftWithQuestionsTemplate: classificationResult.draftTemplate || "",
          status: 'pending_input'
        };

        await TaskStateManager.addTask(taskData);
        console.log(`📝 Task created for email "${sanitizedEmail.subject}" and saved.`);
      } else if (classificationResult.classification !== 'auto_draft') {
        // If not auto_draft and not explicitly needs_input, log it for now.
        console.log(`Email "${sanitizedEmail.subject}" classified as '${classificationResult.classification}', no action taken by task system.`);
      }
    }
  } catch (error) {
    console.error('❌ Error in checkForNewEmails:', error.message); // Updated log
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