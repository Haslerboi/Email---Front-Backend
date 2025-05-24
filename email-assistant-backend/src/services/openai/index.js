// OpenAI service for interacting with OpenAI API
import { config } from '../../config/env.js';

/**
 * Extract JSON from a string that might contain markdown code blocks
 * @param {string} text - The text that might contain JSON
 * @returns {Object} - Parsed JSON object
 */
const extractJsonFromMarkdown = (text) => {
  try {
    // Check if the response is wrapped in markdown code blocks
    const jsonRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/;
    const match = text.match(jsonRegex);
    
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
    return JSON.parse(text);
  } catch (jsonError) {
    try {
      const cleanedText = text.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanedText);
    } catch (cleanError) {
      throw new Error(`Could not parse as JSON: ${cleanError.message}`);
    }
  }
};

/**
 * Fallback classification method when OpenAI API is unavailable
 * @param {string} text - The email text content to analyze
 * @returns {Object} - Classification and extracted questions
 */
const fallbackClassification = (text) => {
  const questionRegex = /\b(?:who|what|when|where|why|how|can you|could you|would you|will you|is there|are there|do you|did you|have you|has|should|shall|may I|are we|is it)\b.*\?/gi;
  const questions = text.match(questionRegex) || [];
  const needsInputPatterns = [
    /\b(?:price|pricing|quote|cost|rate|package|budget)/i,
    /\b(?:availab|schedule|book|date|time|calendar)/i,
    /\b(?:location|venue|address|place|site)/i,
    /\b(?:custom|specific|particular|exact)/i,
    /what (?:type|kind|style)/i
  ];
  const needsInput = needsInputPatterns.some(pattern => pattern.test(text)) || 
                    questions.length > 0 ||
                    text.includes('?');
  return {
    classification: needsInput ? 'needs_input' : 'auto_draft',
    questions: questions.map(q => q.trim()),
    reasoning: needsInput ? 
      "Contains specific questions or requests that require custom information" : 
      "Can be handled with general information",
    timestamp: new Date().toISOString()
  };
};

/**
 * Classify email text for photographer business using OpenAI
 * @param {string} text - The email text content to analyze
 * @returns {Promise<Object>} - Classification and extracted questions
 */
export const classifyEmailForPhotographer = async (text) => {
  try {
    console.log('Input to classifyEmailForPhotographer:', {
      text: text ? text.substring(0, 100) + '...' : null, 
      isString: typeof text === 'string',
      length: text?.length
    });
    if (!text || typeof text !== 'string') {
      console.error('Invalid input to classifyEmailForPhotographer:', { text });
      throw new Error('Invalid input: text must be a non-empty string');
    }
    console.log('OpenAI Service - Classifying email for photographer business');
    if (!config.openai.apiKey) {
      console.warn('OpenAI API key not found. Using fallback classification method.');
      return fallbackClassification(text);
    }
    try {
      const prompt = `
You are an assistant for a photographer and video business. Given this email, decide whether a reply can be drafted using general information and templates ('auto_draft'), or if the assistant should ask the user for specific answers first ('needs_input'). Also extract any clear questions the email contains.

Classify this email based on whether the assistant can draft a helpful reply using general knowledge and past examples, or if it needs the human to provide more information first.

EMAIL:
"""
${text}
"""

Respond with ONLY valid JSON, no code blocks or formatting, in this exact format:
{
  "classification": "auto_draft" or "needs_input",
  "questions": ["extracted question 1", "extracted question 2", ...],
  "reasoning": "brief explanation of why this classification was chosen"
}`;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o', 
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3, 
          max_tokens: 500,
          response_format: { type: "json_object" } 
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }
      const data = await response.json();
      const content = data.choices[0].message.content;
      let parsedResult;
      try {
        parsedResult = extractJsonFromMarkdown(content);
        console.log('Successfully parsed OpenAI response');
      } catch (parseError) {
        console.error('Error parsing OpenAI response:', parseError);
        console.error('Raw response:', content);
        throw new Error('Failed to parse OpenAI response as JSON');
      }
      return {
        classification: parsedResult.classification || 'needs_input',
        questions: Array.isArray(parsedResult.questions) ? parsedResult.questions : [],
        reasoning: parsedResult.reasoning || 'No reasoning provided',
        timestamp: new Date().toISOString()
      };
    } catch (apiError) {
      console.error('Error calling OpenAI API:', apiError);
      console.warn('Falling back to local classification method');
      return fallbackClassification(text);
    }
  } catch (error) {
    console.error('Error in classifyEmailForPhotographer:', error);
    throw new Error('Failed to classify email: ' + error.message);
  }
};

/**
 * Generate a reply to an email based on original email and user-provided answers to questions.
 * @param {Object} originalEmail - The original email object { sender, subject, body }.
 * @param {Array<Object>} answeredQuestions - Array of { questionText, userAnswer } objects.
 * @returns {Promise<string>} - The generated email reply body text.
 */
export const generateReplyFromContext = async (originalEmail, answeredQuestions) => {
  if (!originalEmail || !originalEmail.body || !answeredQuestions) {
    throw new Error('Missing required parameters for generating reply from context.');
  }
  if (!config.openai.apiKey) {
    console.warn('OpenAI API key not found. Cannot generate context-based reply.');
    return "I have received your answers and will process your request shortly. (OpenAI key not configured)";
  }
  console.log('OpenAI Service - Generating reply from context:');
  let qaBlock = "";
  if (answeredQuestions.length > 0) {
    qaBlock = answeredQuestions.map(qa => `Question: ${qa.questionText}\nAnswer: ${qa.userAnswer}`).join('\n\n');
  } else {
    qaBlock = "No specific questions were answered by the business owner.";
  }
  const prompt = `You are an expert email assistant for a photographer and videographer. Your task is to compose a polite, professional, and helpful draft reply to an email that was received. You have been given the original email and specific answers to questions that were generated to help formulate this reply.

Your reply should:
- Directly address the original sender.
- Maintain a friendly yet professional tone.
- Incorporate the provided answers naturally into the reply.
- Address the main points or queries from the original email.
- Be a complete email body. Do NOT include a subject line, salutation like "Hi ${originalEmail.sender}," or a closing like "Best regards, [Your Name]" unless the answers explicitly provide this full closing. Focus only on the main content of the reply.
- If an answer seems insufficient or unclear for a full reply, acknowledge the query and state that more information will follow if necessary, or use your best judgment to craft a helpful response based on the provided information.

Here is the context:

--- ORIGINAL EMAIL RECEIVED ---
From: ${originalEmail.sender}
Subject: ${originalEmail.subject}

Body:
${originalEmail.body}
--- END OF ORIGINAL EMAIL ---

--- QUESTIONS ASKED TO THE BUSINESS OWNER AND THEIR ANSWERS ---
${qaBlock}
--- END OF QUESTIONS AND ANSWERS ---

Now, please compose ONLY the body of the reply email to ${originalEmail.sender}.`;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openai.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', 
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7, 
        max_tokens: 1000 
      })
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error response (generateReplyFromContext):', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }
    const data = await response.json();
    const replyContent = data.choices[0]?.message?.content?.trim();
    if (!replyContent) {
      console.error('OpenAI response did not contain reply content.', data);
      throw new Error('OpenAI did not return reply content.');
    }
    console.log('OpenAI Service: Reply generated successfully from context.');
    return replyContent;
  } catch (apiError) {
    console.error('Error calling OpenAI API (generateReplyFromContext):', apiError);
    return `Thank you for providing answers regarding "${originalEmail.subject}". We are processing your request. (Error communicating with AI assistant)`;
  }
};

/**
 * Generate a reply to an email (potentially for auto-draft or simpler cases)
 * @param {Object} originalEmail - The email to reply to { subject, body, sender, category? }
 * @param {Object|null} answers - Optional answers (structure might differ or be null for this function)
 * @returns {Promise<Object>} - Object containing { replyText, suggestedSubject, ... }
 */
export const generateReply = async (originalEmail, answers = null) => {
  try {
    const { subject, body, sender, category } = originalEmail;
    console.log('OpenAI Service - Generating reply (general):'); // Clarified log
    console.log(`To: ${sender}`);
    console.log(`Subject: ${subject}`);
    console.log(`Category: ${category || 'Not classified'}`);
    if (!config.openai.apiKey) {
      console.warn('OpenAI API key not found. Using fallback reply method.');
      const replyContent = `Hello,\n\nThank you for your email regarding "${subject}". I'll get back to you with more information soon.\n\nBest regards,\nEmail Assistant`;
      return {
        replyText: replyContent,
        suggestedSubject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        tone: 'professional',
        timestamp: new Date().toISOString(),
      };
    }
    let answersContent = '';
    if (answers && Object.keys(answers).length > 0) {
      answersContent = "User's answers to specific questions:\n";
      // This answer formatting might need to be more generic if `answers` structure varies
      for (const [question, answer] of Object.entries(answers)) {
        answersContent += `Question: ${question}\nAnswer: ${answer}\n\n`;
      }
      console.log(`Including ${Object.keys(answers).length} user-provided answers in the prompt for general reply.`);
    } else {
      console.log('No user answers provided, generating reply using general knowledge for general reply.');
    }
    const prompt = `
You are an assistant for a photo/video business. Using the email below ${answersContent ? 'and the provided answers' : ''}, write a friendly, professional reply that matches the user's usual tone. Reply in complete sentences with helpful detail. If no specific answers are provided, use general knowledge and templates.

ORIGINAL EMAIL:
From: ${sender}
Subject: ${subject}
Body:
${body}

${answersContent}

Write only the body of the reply email. Do not include any headers, signatures, or formatting outside the actual reply content. Reply as if you are the business owner.`;
    console.log('Sending request to OpenAI API (general reply)...');
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o', 
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 800
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error response (general reply):', errorData);
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
      }
      console.log('Received successful response from OpenAI API (general reply).');
      const data = await response.json();
      const replyContent = data.choices[0].message.content.trim();
      console.log('Reply content length (general reply):', replyContent.length);
      return {
        replyText: replyContent,
        suggestedSubject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        tone: 'professional',
        timestamp: new Date().toISOString(),
      };
    } catch (apiError) {
      console.error('Error during OpenAI API call (general reply):', apiError);
      console.error('API Error details (general reply):', apiError.stack || apiError);
      const fallbackReply = `Hello,\n\nThank you for your email regarding "${subject}". I'll get back to you with more information soon.\n\nBest regards,\nEmail Assistant`;
      console.log('Using fallback reply due to API error (general reply).');
      return {
        replyText: fallbackReply,
        suggestedSubject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        tone: 'professional',
        timestamp: new Date().toISOString(),
        error: apiError.message
      };
    }
  } catch (error) {
    console.error('Error in OpenAI service (general reply):', error);
    console.error('Error details (general reply):', error.stack || error);
    throw new Error('Failed to generate general reply: ' + error.message);
  }
};

export default {
  classifyEmailForPhotographer,
  generateReply,
  generateReplyFromContext,
}; 