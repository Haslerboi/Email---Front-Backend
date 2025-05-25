import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config/env.js';
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
    // Fallback behavior: treat as needing input and 'Other' category
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
        isSpamOrUnimportant: true, // Treat empty as unimportant
        needsHumanInput: false,
        questions: [],
        category: 'Other',
        reasoning: 'Email body was empty or invalid.'
    };
  }

  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-latest",
    generationConfig: { responseMimeType: "application/json" } // Request JSON output
  });

  const prompt = `Analyze the following email content. Provide your analysis ONLY in a valid JSON format, with no markdown code blocks or other formatting. The JSON object should have the following fields:
- "isSpamOrUnimportant": boolean (true if the email is spam, a simple notification, an automated message, out-of-office, or clearly doesn't require a reply from the business owner; false otherwise)
- "category": string (categorize the email into one of: "Wedding Enquiry", "Main Website Enquiry", or "Other")
- "needsHumanInput": boolean (true if specific information not found in the email is required from the business owner to draft a meaningful reply; false if a reply can be drafted using general templates or if no reply is needed because it's spam/unimportant)
- "questions": array of strings (if needsHumanInput is true, list the specific questions the business owner needs to answer to enable a reply. If needsHumanInput is false, this should be an empty array.)
- "reasoning": string (a brief explanation for your classification and decisions)

Email Content:
"""
${emailBody}
"""

JSON Response:`;

  try {
    logger.info('Sending request to Gemini API for triage and categorization...', { tag: 'geminiService' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    logger.info('Received response from Gemini API.', { tag: 'geminiService' });
    // console.log('Gemini Raw Response Text:', responseText); // For debugging

    const parsedResult = extractJsonFromGeminiResponse(responseText);
    logger.info('Successfully parsed Gemini response.', { tag: 'geminiService', parsedResult });

    // Validate and structure the output
    return {
      isSpamOrUnimportant: typeof parsedResult.isSpamOrUnimportant === 'boolean' ? parsedResult.isSpamOrUnimportant : true, // Default to true if missing
      needsHumanInput: typeof parsedResult.needsHumanInput === 'boolean' ? parsedResult.needsHumanInput : !parsedResult.isSpamOrUnimportant, // Default based on spam status
      questions: Array.isArray(parsedResult.questions) ? parsedResult.questions : [],
      category: ['Wedding Enquiry', 'Main Website Enquiry', 'Other'].includes(parsedResult.category) ? parsedResult.category : 'Other',
      reasoning: parsedResult.reasoning || 'No reasoning provided by Gemini.'
    };

  } catch (error) {
    logger.error('Error calling Gemini API or processing its response:', { 
        tag: 'geminiService', 
        errorMessage: error.message, 
        // stack: error.stack // Stack might be too verbose for regular logs unless debugging
    });
    // Fallback in case of Gemini API error
    return {
      isSpamOrUnimportant: false,
      needsHumanInput: true,
      questions: ['Failed to analyze email with AI. Please review manually.'],
      category: 'Other',
      reasoning: `Gemini API error: ${error.message}`
    };
  }
};

export default { triageAndCategorizeEmail }; 