import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

let genAI;
if (config.gemini && config.gemini.apiKey) {
  genAI = new GoogleGenerativeAI(config.gemini.apiKey);
} else {
  logger.warn('Gemini API key not found. Gemini service will not be functional.', { tag: 'geminiService' });
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
 * Uses Gemini to triage, categorize an email, and extract questions if needed.
 * @param {string} emailBody - The text content of the email.
 * @returns {Promise<Object>} - An object containing {isSpamOrUnimportant, needsHumanInput, questions, category, reasoning}
 */
export const triageAndCategorizeEmail = async (emailBody) => {
  if (!genAI) {
    logger.error('Gemini API client not initialized. Cannot process email.', { tag: 'geminiService' });
    return {
      isSpamOrUnimportant: false,
      needsHumanInput: true,
      questions: ['Could not process with AI, please review entire email.'],
      category: 'Other',
      reasoning: 'Gemini API client not available.'
    };
  }

  if (!emailBody || typeof emailBody !== 'string' || emailBody.trim() === '') {
    logger.warn('triageAndCategorizeEmail called with empty or invalid emailBody', {tag: 'geminiService'});
    return {
        isSpamOrUnimportant: true, 
        needsHumanInput: false,
        questions: [],
        category: 'Other',
        reasoning: 'Email body was empty or invalid.'
    };
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `You are analyzing an email for a photographer/videographer business. The email content may contain a full conversation thread with multiple messages.

IMPORTANT: Follow these steps in order:

STEP 1 - SPAM/UNIMPORTANT CHECK (analyze the entire thread):
Examine the full email thread to determine if this is spam or unimportant. Mark as spam/unimportant if it is:
- Clear spam, phishing, or promotional content
- Automated notifications (unless from critical senders: no-reply@studioninja.app, notifications@pixiesetmail.com, form-submission@squarespace.info)
- Out-of-office auto-replies
- Messages that clearly don't require any business response

STEP 2 - CATEGORIZATION (analyze the entire thread context):
If not spam/unimportant, look at the ENTIRE email thread to understand the context. Use sender information as a strong hint:
- If sender is no-reply@studioninja.app, it is a "Wedding Enquiry".
- If sender is notifications@pixiesetmail.com, it could be "General" or other types; analyze content carefully.
Categorize into one of these:
- "General": Default category for emails that don't fit others
- "Wedding Enquiry": ONLY for initial wedding photography/videography inquiries (typically from website forms, especially no-reply@studioninja.app)
- "Wedding General": Any wedding-related communication that is NOT an initial inquiry (follow-ups, vendor coordination, etc.)
- "Quote Pricing questions": Pricing/quote requests that are NOT wedding-related

STEP 3 - QUESTION EXTRACTION (analyze ONLY the newest message):
Identify the newest/latest message in the thread (usually at the top, not quoted/indented, or has the latest timestamp if available in headers). 
From ONLY this latest message, extract any direct questions the sender asked.
- Only include actual questions the sender explicitly asked
- Do NOT include questions from older messages in the thread
- Do NOT invent or infer questions
- If the latest message contains no questions, return an empty array

STEP 4 - DETERMINE IF HUMAN INPUT NEEDED:
Set needsHumanInput to true if BOTH conditions are met:
- The email is not spam/unimportant (Step 1 = false)
- The latest message contains at least one question (Step 3 found questions)

Provide your analysis as a JSON object with these exact fields:
{
  "isSpamOrUnimportant": boolean,
  "category": "General" | "Wedding Enquiry" | "Wedding General" | "Quote Pricing questions",
  "questionsFromSender": ["question 1", "question 2", ...],
  "needsHumanInput": boolean,
  "reasoning": "Brief explanation of your analysis, referencing sender and newest message as appropriate"
}

Email Content to Analyze (includes sender and date headers when available):
"""
${emailBody} 
"""

Return ONLY valid JSON, no markdown formatting or code blocks.`;

  try {
    logger.info('Sending request to Gemini API for refined triage and categorization (focus on latest message)...', { tag: 'geminiService' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    logger.info('Received response from Gemini API.', { tag: 'geminiService' });
    const parsedResult = extractJsonFromGeminiResponse(responseText);
    logger.info('Successfully parsed Gemini response.', { tag: 'geminiService', parsedResult });

    const isSpam = typeof parsedResult.isSpamOrUnimportant === 'boolean' ? parsedResult.isSpamOrUnimportant : true;
    const questions = Array.isArray(parsedResult.questionsFromSender) ? parsedResult.questionsFromSender : [];
    const determinedNeedsHumanInput = !isSpam && questions.length > 0;

    return {
      isSpamOrUnimportant: isSpam,
      needsHumanInput: typeof parsedResult.needsHumanInput === 'boolean' ? parsedResult.needsHumanInput : determinedNeedsHumanInput,
      questions: questions, 
      category: ['General', 'Wedding Enquiry', 'Wedding General', 'Quote Pricing questions'].includes(parsedResult.category) ? parsedResult.category : 'General',
      reasoning: parsedResult.reasoning || 'No reasoning provided by Gemini.'
    };

  } catch (error) {
    logger.error('Error calling Gemini API or processing its response:', { 
        tag: 'geminiService', 
        errorMessage: error.message,
    });
    return {
      isSpamOrUnimportant: false,
      needsHumanInput: true, 
      questions: ['Failed to analyze email with AI (Gemini). Please review manually.'],
      category: 'Other',
      reasoning: `Gemini API error: ${error.message}`
    };
  }
};

export default { triageAndCategorizeEmail }; 