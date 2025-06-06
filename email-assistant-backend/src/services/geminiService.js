import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import { isWhitelistedSpamSender } from './whitelistService.js';

let genAI;
if (config.gemini && config.gemini.apiKey) {
  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    logger.info('Gemini API client initialized successfully', { 
      tag: 'geminiService',
      apiKeyLength: config.gemini.apiKey.length,
      apiKeyPrefix: config.gemini.apiKey.substring(0, 8) + '***'
    });
    
    // Test the API with a simple request
    (async () => {
      try {
        const testModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const testResult = await testModel.generateContent("Test connection - respond with just 'OK'");
        logger.info('Gemini API test successful', { tag: 'geminiService' });
      } catch (testError) {
        logger.error('Gemini API test failed:', { 
          error: testError.message, 
          tag: 'geminiService' 
        });
      }
    })();
    
  } catch (initError) {
    logger.error('Failed to initialize Gemini API client:', { 
      error: initError.message, 
      tag: 'geminiService' 
    });
    genAI = null;
  }
} else {
  logger.warn('Gemini API key not found. Gemini service will not be functional.', { 
    tag: 'geminiService',
    hasConfig: !!config.gemini,
    hasApiKey: !!(config.gemini && config.gemini.apiKey),
    apiKeyLength: config.gemini?.apiKey ? config.gemini.apiKey.length : 0
  });
}

// Helper to extract JSON from Gemini's response, which might include markdown
const extractJsonFromGeminiResponse = (text) => {
  try {
    const jsonRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
    const match = text.match(jsonRegex);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
    // If not in markdown, try to parse directly (Gemini sometimes returns clean JSON)
    return JSON.parse(text);
  } catch (e) {
    logger.error('Failed to parse JSON from Gemini response:', { error: e.message, text });
    throw new Error('Failed to parse JSON from Gemini response.');
  }
};

/**
 * Uses Gemini to categorize emails into the new 4-category system
 * @param {string} emailBody - The text content of the email.
 * @param {string} senderEmail - The sender's email address.
 * @param {string} emailSubject - The email subject line.
 * @param {Object} emailHeaders - Full email headers including reply-to, etc.
 * @returns {Promise<Object>} - An object containing {category, reasoning}
 */
export const categorizeEmail = async (emailBody, senderEmail, emailSubject = '', emailHeaders = null) => {
  // Check for Studio Ninja emails first (before any other processing)
  if (senderEmail && senderEmail.toLowerCase().includes('no-reply@studioninja.app')) {
    logger.info('Detected Studio Ninja email, applying special categorization', {
      tag: 'geminiService',
      senderEmail: senderEmail,
      emailSubject: emailSubject
    });
    
    // Check if email has reply-to field (indicates wedding enquiry)
    const hasReplyTo = emailHeaders && emailHeaders['reply-to'];
    const hasFrom = emailHeaders && emailHeaders['from'];
    const hasTo = emailHeaders && emailHeaders['to'];
    
    if (hasReplyTo && hasFrom && hasTo) {
      logger.info('Studio Ninja email has reply-to field - categorizing as Wedding Enquiry', {
        tag: 'geminiService',
        replyTo: emailHeaders['reply-to'],
        senderEmail: senderEmail
      });
      return {
        category: 'Studio Ninja Wedding Enquiry',
        reasoning: 'Studio Ninja email with reply-to field detected - this is a wedding enquiry that needs special handling'
      };
    } else {
      logger.info('Studio Ninja email without reply-to field - categorizing as Studio Ninja System', {
        tag: 'geminiService',
        senderEmail: senderEmail
      });
      return {
        category: 'Studio Ninja System',
        reasoning: 'Studio Ninja system email without reply-to field - mark as read and leave in inbox'
      };
    }
  }

  if (!genAI) {
    logger.warn('Gemini API client not initialized. Using fallback categorization.', { 
      tag: 'geminiService',
      hasConfig: !!config.gemini,
      hasApiKey: !!(config.gemini && config.gemini.apiKey),
      senderEmail: senderEmail
    });
    
    // Enhanced fallback categorization logic
    const emailContent = `${emailSubject} ${emailBody} ${senderEmail}`.toLowerCase();
    
    // Check for invoices/billing first
    if (emailContent.includes('invoice') || emailContent.includes('bill') || emailContent.includes('payment') || 
        emailContent.includes('statement') || emailContent.includes('receipt')) {
      return {
        category: 'Invoices',
        reasoning: 'Fallback categorization: Contains invoice/billing keywords'
      };
    }
    
    // Check for promotional/marketing content
    const spamKeywords = [
      'unsubscribe', 'newsletter', 'marketing', 'promotion', 'sale', 'discount', 
      'offer', 'deal', 'shop now', 'buy now', 'limited time', 'exclusive',
      'click here', 'free shipping', 'save', 'off', '%', 'weekly update',
      'monthly update', 'blog post', 'new article', 'subscribe', 'follow us',
      'social media', 'instagram', 'facebook', 'twitter'
    ];
    
    const hasSpamKeywords = spamKeywords.some(keyword => emailContent.includes(keyword));
    
    // Check sender patterns that indicate promotional emails
    const promotionalSenders = [
      'newsletter', 'marketing', 'promo', 'noreply', 'no-reply', 'info@', 
      'hello@', 'news@', 'updates@', 'support@', 'team@'
    ];
    
    const isPromotionalSender = promotionalSenders.some(pattern => senderEmail.includes(pattern));
    
    if (hasSpamKeywords || isPromotionalSender) {
      return {
        category: 'Spam',
        reasoning: 'Fallback categorization: Contains promotional/marketing content or sender patterns'
      };
    }
    
    // Check for notification patterns
    const notificationKeywords = [
      'notification', 'alert', 'update', 'report', 'summary', 'status',
      'backup completed', 'system', 'automated', 'no-reply', 'noreply',
      'deployment', 'crashed', 'failed', 'build', 'deploy', 'server',
      'uptime', 'downtime', 'incident', 'maintenance'
    ];
    
    const notificationSenders = [
      'github', 'slack', 'trello', 'dropbox', 'google drive', 'icloud',
      'aws', 'microsoft', 'adobe', 'zoom', 'calendly', 'railway',
      'heroku', 'vercel', 'netlify', 'cloudflare'
    ];
    
    const hasNotificationKeywords = notificationKeywords.some(keyword => emailContent.includes(keyword));
    const isNotificationSender = notificationSenders.some(pattern => senderEmail.toLowerCase().includes(pattern));
    
    if (hasNotificationKeywords || isNotificationSender) {
      return {
        category: 'Notifications',
        reasoning: 'Fallback categorization: Contains notification keywords or sender patterns'
      };
    }
    
    // Default to Draft Email only for legitimate-looking emails
    return {
      category: 'Draft Email',
      reasoning: 'Fallback categorization: Appears to be legitimate business email, defaulting to Draft Email.'
    };
  }

  if (!emailBody || typeof emailBody !== 'string' || emailBody.trim() === '') {
    logger.warn('categorizeEmail called with empty or invalid emailBody', {tag: 'geminiService'});
    return {
      category: 'Spam',
      reasoning: 'Email body was empty or invalid.'
    };
  }

  // Check whitelist first
  if (await isWhitelistedSpamSender(senderEmail)) {
    logger.info(`Sender ${senderEmail} is whitelisted, categorizing as Whitelisted Spam`, {tag: 'geminiService'});
    return {
      category: 'Whitelisted Spam',
      reasoning: 'Sender is in the whitelist.'
    };
  }

  // Try to get the model with fallback
  let model;
  try {
    model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: { responseMimeType: "application/json" } 
    });
  } catch (modelError) {
    logger.warn('Failed to get gemini-2.0-flash, trying gemini-1.5-pro as fallback', { 
      tag: 'geminiService',
      error: modelError.message
    });
    try {
      model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-pro",
        generationConfig: { responseMimeType: "application/json" } 
      });
    } catch (fallbackError) {
      logger.error('Both gemini models failed to initialize', { 
        tag: 'geminiService',
        primaryError: modelError.message,
        fallbackError: fallbackError.message
      });
      throw new Error(`Model initialization failed: ${modelError.message}, fallback also failed: ${fallbackError.message}`);
    }
  }

  const prompt = `You are analyzing an email for a photographer/videographer business. The email content may contain a full conversation thread with multiple messages.

Your task is to categorize the email into ONE of these four categories EXACTLY as written:

**REQUIRED CATEGORIES (choose one exactly):**
- "Draft Email"
- "Invoices" 
- "Spam"
- "Notifications"

**CATEGORIZATION RULES:**

**"Draft Email"** - Use for legitimate business communications:
- Client inquiries about photography/videography services
- Business communications requiring response
- Personal emails from known contacts
- Booking requests, project discussions
- Wedding inquiries and consultations
- Any legitimate email that needs attention

**"Invoices"** - Use for financial/billing emails:
- Bills, invoices, payment requests
- Financial statements, receipts
- Accounting-related emails
- Subscription billing emails

**"Spam"** - Use for promotional/marketing content:
- Marketing emails, promotions, newsletters
- Mass marketing campaigns
- Emails with "unsubscribe" links
- Obvious spam or phishing attempts

**"Notifications"** - Use for automated system notifications:
- App notifications (social media, software updates)
- Service notifications (cloud storage, hosting, etc.)
- System alerts and status updates
- Automated reports and summaries
- Platform notifications (GitHub, Slack, etc.)
- Non-urgent automated messages that don't require immediate action

**CRITICAL:** 
- You MUST use one of these exact category names: "Draft Email", "Invoices", "Spam", or "Notifications"
- When unsure between "Draft Email" and "Notifications", choose "Draft Email"
- When unsure between "Spam" and "Notifications", choose "Notifications" if it's from a legitimate service
- Do NOT create new category names

**Email to categorize:**
Sender: ${senderEmail}
Subject: ${emailSubject}
Body: ${emailBody}

**Response format (use exactly this structure):**
{
  "category": "Draft Email" | "Invoices" | "Spam",
  "reasoning": "Brief explanation of why this category was chosen"
}`;

  try {
    logger.info('Sending request to Gemini API for new categorization system...', { 
      tag: 'geminiService',
      senderEmail: senderEmail,
      emailSubject: emailSubject,
      emailBodyLength: emailBody ? emailBody.length : 0,
      emailSubjectLength: emailSubject ? emailSubject.length : 0
    });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    logger.info('Received response from Gemini API.', { 
      tag: 'geminiService',
      responseLength: responseText ? responseText.length : 0
    });
    
    const parsedResult = extractJsonFromGeminiResponse(responseText);
    logger.info('Successfully parsed Gemini response.', { 
      tag: 'geminiService', 
      category: parsedResult.category,
      reasoning: parsedResult.reasoning 
    });

    // Validate category
    const validCategories = ['Draft Email', 'Invoices', 'Spam', 'Notifications'];
    const category = validCategories.includes(parsedResult.category) ? parsedResult.category : 'Draft Email';

    return {
      category: category,
      reasoning: parsedResult.reasoning || 'No reasoning provided by Gemini.'
    };

  } catch (error) {
    // Enhanced error logging for better debugging
    const errorDetails = {
      tag: 'geminiService',
      errorMessage: error.message,
      errorName: error.name,
      errorCode: error.code,
      stack: error.stack,
      senderEmail: senderEmail,
      emailSubject: emailSubject,
      emailBodyLength: emailBody ? emailBody.length : 0,
      emailSubjectLength: emailSubject ? emailSubject.length : 0,
      hasGenAI: !!genAI,
      apiKeyLength: config.gemini?.apiKey ? config.gemini.apiKey.length : 0
    };

    // Check for specific error types
    if (error.message.includes('API_KEY')) {
      logger.error('Gemini API Key error - check configuration:', errorDetails);
    } else if (error.message.includes('QUOTA') || error.message.includes('quota')) {
      logger.error('Gemini API Quota exceeded:', errorDetails);
    } else if (error.message.includes('RATE_LIMIT') || error.message.includes('rate')) {
      logger.error('Gemini API Rate limit hit:', errorDetails);
    } else if (error.message.includes('model')) {
      logger.error('Gemini Model error - check model availability:', errorDetails);
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      logger.error('Gemini Network/timeout error:', errorDetails);
    } else {
      logger.error('Unknown Gemini API error:', errorDetails);
    }

    return {
      category: 'Draft Email',
      reasoning: `Gemini API error: ${error.message}, defaulting to Draft Email for safety.`
    };
  }
};

// Keep the old function name for backward compatibility during transition
export const triageAndCategorizeEmail = categorizeEmail;

export default { categorizeEmail, triageAndCategorizeEmail }; 