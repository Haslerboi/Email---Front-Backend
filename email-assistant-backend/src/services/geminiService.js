import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';
import { isWhitelistedSpamSender } from './whitelistService.js';

let genAI;
if (config.gemini && config.gemini.apiKey) {
  try {
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    logger.info('Gemini API client initialized successfully', { tag: 'geminiService' });
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
 * @returns {Promise<Object>} - An object containing {category, reasoning}
 */
export const categorizeEmail = async (emailBody, senderEmail) => {
  if (!genAI) {
    logger.warn('Gemini API client not initialized. Using fallback categorization.', { 
      tag: 'geminiService',
      hasConfig: !!config.gemini,
      hasApiKey: !!(config.gemini && config.gemini.apiKey),
      senderEmail: senderEmail
    });
    
    // Fallback categorization logic
    const emailContent = `${emailBody}`.toLowerCase();
    
    // Simple keyword-based categorization
    if (emailContent.includes('invoice') || emailContent.includes('bill') || emailContent.includes('payment')) {
      return {
        category: 'Invoices',
        reasoning: 'Fallback categorization: Contains invoice/billing keywords'
      };
    }
    
    if (emailContent.includes('unsubscribe') || emailContent.includes('newsletter') || emailContent.includes('marketing')) {
      return {
        category: 'Spam',
        reasoning: 'Fallback categorization: Contains marketing/spam keywords'
      };
    }
    
    return {
      category: 'Draft Email',
      reasoning: 'Fallback categorization: Gemini API not available, defaulting to Draft Email for safety.'
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

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `You are analyzing an email for a photographer/videographer business. The email content may contain a full conversation thread with multiple messages.

Your task is to categorize the email into ONE of these four categories:

1. "Draft Email" - Legitimate emails that require a thoughtful response (inquiries, client communications, business requests, etc.)
2. "Invoices" - Any invoice-related emails, billing statements, payment requests, financial documents
3. "Spam" - Promotional emails, marketing, newsletters, automated notifications, obvious spam, phishing attempts
4. "Whitelisted Spam" - (This category is handled separately by whitelist logic, don't assign this)

CATEGORIZATION GUIDELINES:

"Draft Email" - Use for:
- Client inquiries about photography/videography services
- Business communications requiring response
- Personal emails from known contacts
- Booking requests, project discussions
- Any legitimate email that needs attention

"Invoices" - Use for:
- Bills, invoices, payment requests
- Financial statements, receipts
- Accounting-related emails
- Subscription billing emails

"Spam" - Use for:
- Marketing emails, promotions, newsletters
- Automated notifications (social media, apps, etc.)
- Obvious spam or phishing attempts
- Mass marketing campaigns
- Unsubscribe confirmations
- System notifications that don't require action

IMPORTANT: When in doubt between "Draft Email" and "Spam", lean towards "Draft Email" to avoid missing important business communications.

Analyze the email content below and provide your categorization:

Email Content:
Sender: ${senderEmail}
Body: ${emailBody}

Return ONLY valid JSON with this exact structure:
{
  "category": "Draft Email" | "Invoices" | "Spam",
  "reasoning": "Brief explanation of why this category was chosen"
}`;

  try {
    logger.info('Sending request to Gemini API for new categorization system...', { tag: 'geminiService' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    logger.info('Received response from Gemini API.', { tag: 'geminiService' });
    const parsedResult = extractJsonFromGeminiResponse(responseText);
    logger.info('Successfully parsed Gemini response.', { tag: 'geminiService', parsedResult });

    // Validate category
    const validCategories = ['Draft Email', 'Invoices', 'Spam'];
    const category = validCategories.includes(parsedResult.category) ? parsedResult.category : 'Draft Email';

    return {
      category: category,
      reasoning: parsedResult.reasoning || 'No reasoning provided by Gemini.'
    };

  } catch (error) {
    logger.error('Error calling Gemini API or processing its response:', { 
        tag: 'geminiService', 
        errorMessage: error.message,
        stack: error.stack,
        senderEmail: senderEmail,
        emailBodyLength: emailBody ? emailBody.length : 0
    });
    return {
      category: 'Draft Email',
      reasoning: `Gemini API error: ${error.message}, defaulting to Draft Email for safety.`
    };
  }
};

// Keep the old function name for backward compatibility during transition
export const triageAndCategorizeEmail = categorizeEmail;

export default { categorizeEmail, triageAndCategorizeEmail }; 