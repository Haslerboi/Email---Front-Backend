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
    model: "gemini-1.5-flash-latest",
    generationConfig: { responseMimeType: "application/json" } 
  });

  const prompt = `Analyze the following email content. Your goal is to help a photographer/videographer manage their inbox efficiently. Provide your analysis ONLY in a valid JSON format, with no markdown code blocks or other formatting. The JSON object must have the following fields:

1.  "isSpamOrUnimportant": boolean. Set to true if the email is clear spam, a trivial notification (e.g., social media like, simple payment receipt not needing action), an out-of-office auto-reply, or clearly promotional and doesn't require a reply from the business owner. Otherwise, set to false.

2.  "category": string. Categorize the email into one of: "Wedding Enquiry", "Main Website Enquiry", or "Other". Choose the most fitting category.

3.  "questionsFromSender": array of strings. Carefully analyze the email body and extract any direct questions the SENDER has explicitly asked. List each distinct question as a string in the array. If the sender asked no direct questions, this must be an empty array []. Do NOT invent questions the sender didn't ask.

4.  "needsHumanInput": boolean. Set to true if "isSpamOrUnimportant" is false AND the "questionsFromSender" array is NOT empty (meaning the sender asked questions that need answers from the business owner). If "isSpamOrUnimportant" is false and "questionsFromSender" IS empty, set this to false (implying an auto-draft can be attempted based on the category).

5.  "reasoning": string. Briefly explain your decisions for classification, spam detection, and why human input is or isn't needed.

Email Content:
"""
${emailBody}
"""

JSON Response:`;

  try {
    logger.info('Sending request to Gemini API for refined triage and categorization...', { tag: 'geminiService' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    logger.info('Received response from Gemini API.', { tag: 'geminiService' });
    const parsedResult = extractJsonFromGeminiResponse(responseText);
    logger.info('Successfully parsed Gemini response.', { tag: 'geminiService', parsedResult });

    // Validate and structure the output based on the new prompt structure
    const isSpam = typeof parsedResult.isSpamOrUnimportant === 'boolean' ? parsedResult.isSpamOrUnimportant : true;
    const questions = Array.isArray(parsedResult.questionsFromSender) ? parsedResult.questionsFromSender : [];
    // Determine needsHumanInput based on spam status and if sender asked questions
    const determinedNeedsHumanInput = !isSpam && questions.length > 0;

    return {
      isSpamOrUnimportant: isSpam,
      // Use the 'needsHumanInput' from Gemini if provided and valid, otherwise derive it.
      // Gemini might have nuances (e.g. no questions but still needs input due to category), let's allow its decision.
      needsHumanInput: typeof parsedResult.needsHumanInput === 'boolean' ? parsedResult.needsHumanInput : determinedNeedsHumanInput,
      questions: questions, // These are now questions *from the sender*
      category: ['Wedding Enquiry', 'Main Website Enquiry', 'Other'].includes(parsedResult.category) ? parsedResult.category : 'Other',
      reasoning: parsedResult.reasoning || 'No reasoning provided by Gemini.'
    };

  } catch (error) {
    logger.error('Error calling Gemini API or processing its response:', { 
        tag: 'geminiService', 
        errorMessage: error.message,
    });
    return {
      isSpamOrUnimportant: false,
      needsHumanInput: true, // Fallback to needing human input on error
      questions: ['Failed to analyze email with AI (Gemini). Please review manually.'],
      category: 'Other',
      reasoning: `Gemini API error: ${error.message}`
    };
  }
};

export default { triageAndCategorizeEmail }; 