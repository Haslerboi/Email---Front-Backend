// OpenAI service for interacting with OpenAI API
import { config } from '../../config/env.js';
import logger from '../../utils/logger.js';

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
  // New fallback logic for four categories
  let category = 'General';
  if (/wedding/i.test(text) && /enquiry|inquiry|form|website/i.test(text)) {
    category = 'Wedding Enquiry';
  } else if (/wedding/i.test(text)) {
    category = 'Wedding General';
  } else if (/(price|pricing|quote|cost|rate|package|budget)/i.test(text) && !/wedding/i.test(text)) {
    category = 'Quote Pricing questions';
  }
  return {
    classification: needsInput ? 'needs_input' : 'auto_draft',
    questions: questions.map(q => q.trim()),
    reasoning: needsInput ? 
      "Contains specific questions or requests that require custom information" : 
      "Can be handled with general information",
    category,
    timestamp: new Date().toISOString()
  };
};

/**
 * Classify email text for photographer business using OpenAI
 * @param {string} text - The email text content to analyze
 * @returns {Promise<Object>} - Classification and extracted questions
 */
export const classifyEmailForPhotographer = async (text) => {
  // This function is now primarily for the OLD workflow if still needed for comparison,
  // or if Gemini fails and we want an OpenAI fallback for question generation.
  // For the new workflow, Gemini handles initial classification and question extraction.
  // Consider if this function needs to be kept or adapted.
  // For now, its internal logic remains, but its usage in gmail/index.js will change.
  logger.warn('classifyEmailForPhotographer (OpenAI) called. This should ideally be replaced by Gemini for initial triage.', {tag: 'openaiService'});
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
You are an assistant for a photographer and video business. Given this email, classify it into one of the following categories: "General" (default if it doesn't fit others), "Wedding Enquiry" (ONLY for initial wedding website enquiries), "Wedding General" (anything wedding related that is NOT the initial website form), or "Quote Pricing questions" (excluding wedding emails). Also, decide whether a reply can be drafted using general information and templates ('auto_draft'), or if the assistant should ask the user for specific answers first ('needs_input'). Also extract any clear questions the email contains.

EMAIL:
"""
${text}
"""

Respond with ONLY valid JSON, no code blocks or formatting, in this exact format:
{
  "classification": "auto_draft" or "needs_input",
  "category": "General" | "Wedding Enquiry" | "Wedding General" | "Quote Pricing questions",
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
          model: 'gpt-5', 
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
        category: parsedResult.category || 'General',
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
 * Generate a reply to an email based on a system guide, original email, and (optional) user-provided answers.
 * @param {string} systemGuide - The system prompt / guide for this category of email.
 * @param {Object} originalEmail - The original email object { sender, subject, body }.
 * @param {Array<Object>} [answeredQuestions] - Optional array of { questionText, userAnswer } objects.
 * @returns {Promise<string>} - The generated email reply body text.
 */
export const generateGuidedReply = async (systemGuide, originalEmail, answeredQuestions = []) => {
  if (!systemGuide || !originalEmail || !originalEmail.body) {
    throw new Error('Missing required parameters for generating guided reply.');
  }

  if (!config.openai.apiKey) {
    logger.warn('OpenAI API key not found. Cannot generate guided reply.', {tag: 'openaiService'});
    return "I have received your information and will process your request shortly. (OpenAI key not configured)";
  }

  logger.info('OpenAI Service - Generating guided reply with GPT-5 (or similar premium model)', {tag: 'openaiService'});

  let qaBlock = "";
  if (answeredQuestions && answeredQuestions.length > 0) {
    qaBlock = answeredQuestions.map(qa => `Business Owner's Answer to: "${qa.questionText}"\nAnswer: "${qa.userAnswer}"`).join('\n\n');
    qaBlock = `\n\n--- SPECIFIC ANSWERS FROM BUSINESS OWNER ---\n${qaBlock}\n--- END OF SPECIFIC ANSWERS ---`;
  } else {
    qaBlock = "\n\n(No specific answers were provided by the business owner for this reply.)";
  }

  const userPromptContent = `The following is an email thread. Draft a complete, ready-to-send reply to the newest message from "${originalEmail.sender}".

--- FULL EMAIL THREAD RECEIVED (NEWEST MESSAGE IS TYPICALLY AT THE TOP OR NOT INDENTED) ---
From: ${originalEmail.sender}
Subject: ${originalEmail.subject}

Body (may contain full thread):
${originalEmail.body}
--- END OF FULL EMAIL THREAD ---${qaBlock}

Follow the SYSTEM GUIDE exactly. Requirements:
- Write a complete email including greeting, acknowledgment, body, and closing/sign-off.
- Do not include a subject line.
- Do not use markdown formatting, code blocks, or headings.
- Keep content plain text suitable for an email draft in Gmail.
- If pricing is mentioned in the SYSTEM GUIDE as optional or to be left blank, do not invent numbers; leave blanks where appropriate.`;

  const messages = [
    { role: 'system', content: systemGuide }, // systemGuide comes from templateManager
    { role: 'user', content: userPromptContent }
  ];

  const promptForLogging = `System Prompt: ${systemGuide.substring(0,120)}... User Prompt: ${userPromptContent.substring(0,240)}...`;
  if (process.env.OPENAI_LOG_PROMPTS === 'true') {
    logger.debug('Sending prompt to GPT-5:', {tag: 'openaiService', promptContext: promptForLogging});
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openai.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: messages,
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const raw = await response.text();
      let errorMessage = response.statusText;
      try { const asJson = JSON.parse(raw); errorMessage = asJson.error?.message || raw; } catch {}
      logger.error('OpenAI API error response (generateGuidedReply):', { tag: 'openaiService', status: response.status, body: raw });
      // Targeted fallback if model/availability problem
      if (/model|unsupported|not found|unavailable/i.test(errorMessage)) {
        logger.warn('Retrying generateGuidedReply with fallback model gpt-4o', { tag: 'openaiService' });
        const fallbackResp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openai.apiKey}`
          },
          body: JSON.stringify({ model: 'gpt-4o', messages, temperature: 0.3, max_tokens: 1500 })
        });
        if (!fallbackResp.ok) {
          const fallbackRaw = await fallbackResp.text();
          logger.error('Fallback model also failed (generateGuidedReply)', { tag: 'openaiService', status: fallbackResp.status, body: fallbackRaw });
          throw new Error(`OpenAI error on fallback: ${fallbackRaw}`);
        }
        const fallbackData = await fallbackResp.json();
        const replyContent = fallbackData.choices[0]?.message?.content?.trim();
        if (!replyContent) throw new Error('OpenAI fallback did not return reply content.');
        logger.info('OpenAI Service: Guided reply generated successfully via fallback model.', { tag: 'openaiService' });
        return replyContent;
      }
      throw new Error(`OpenAI API error: ${errorMessage}`);
    }

    const data = await response.json();
    const replyContent = data.choices[0]?.message?.content?.trim();

    if (!replyContent) {
      logger.error('OpenAI response did not contain reply content (generateGuidedReply).', {tag: 'openaiService', data});
      throw new Error('OpenAI did not return reply content.');
    }
    
    logger.info('OpenAI Service: Guided reply generated successfully.', {tag: 'openaiService'});
    return replyContent;

  } catch (apiError) {
    logger.error('Error calling OpenAI API (generateGuidedReply):', {tag: 'openaiService', apiError});
    return `Thank you for your message regarding "${originalEmail.subject}". We are processing your request. (Error communicating with AI assistant for drafting)`;
  }
};

/**
 * Generate a reply to an email (potentially for auto-draft or simpler cases)
 * @param {Object} originalEmail - The email to reply to { subject, body, sender, category? }
 * @param {Object|null} answers - Optional answers (structure might differ or be null for this function)
 * @returns {Promise<Object>} - Object containing { replyText, suggestedSubject, ... }
 */
export const generateReply = async (originalEmail, answers = null, systemGuide = null) => {
  logger.info('OpenAI Service - generateReply (for auto_draft or general) called.', {tag: 'openaiService'});
    if (!config.openai.apiKey) {
    // ... (existing fallback) ...
    logger.warn('OpenAI API key not found. Using fallback reply method.', {tag: 'openaiService'});
      const replyContent = `Hello,\n\nThank you for your email regarding "${originalEmail.subject}". I'll get back to you with more information soon.\n\nBest regards,\nEmail Assistant`;
      return {
        replyText: replyContent,
        suggestedSubject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
        tone: 'professional',
        timestamp: new Date().toISOString(),
      };
    }

  let effectiveSystemGuide = systemGuide;
  if (!effectiveSystemGuide) {
    // Load a default guide if none provided, especially for auto_draft
    // This requires templateManager to be available or a default string here.
    // For simplicity, let's use a generic system message if no guide is passed.
    effectiveSystemGuide = "You are a helpful email assistant. Draft a reply to the following email.";
    logger.info('Using default system guide for generateReply.', {tag: 'openaiService'});
  }

  let qaBlock = "";
  // ... (logic for answers/qaBlock, adapted from generateReplyFromContext or simplified for auto_draft)
    if (answers && Object.keys(answers).length > 0) {
    qaBlock = "User's answers to specific questions:\n";
      for (const [question, answer] of Object.entries(answers)) {
        qaBlock += `Question: ${question}\nAnswer: ${answer}\n\n`;
      }
    qaBlock = `\n\n--- USER-PROVIDED ANSWERS ---\n${qaBlock}\n--- END OF USER-PROVIDED ANSWERS ---`;
    } else {
      qaBlock = "\n\n(No specific user answers were provided for this reply.)";
    }

  const userPrompt = `ORIGINAL EMAIL:
From: ${originalEmail.sender}
Subject: ${originalEmail.subject}
Body:
${originalEmail.body}
${qaBlock}

Follow the SYSTEM GUIDE exactly. Draft a complete, ready-to-send email including greeting, acknowledgment, body, and closing/sign-off. Do not include a subject line. Do not use markdown formatting or code blocks. Keep content plain text suitable for Gmail.`;

  const messages = [
    { role: 'system', content: effectiveSystemGuide },
    { role: 'user', content: userPrompt }
  ];

  const promptForLogging = `System Prompt: ${effectiveSystemGuide.substring(0,120)}... User Prompt: ${userPrompt.substring(0,240)}...`;
  if (process.env.OPENAI_LOG_PROMPTS === 'true') {
    logger.debug('Sending prompt to GPT-5 (generateReply):', {tag: 'openaiService', promptContext: promptForLogging});
  }
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openai.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-5',
          messages: messages,
          temperature: 0.3,
          max_tokens: 1200
        })
      });
      if (!response.ok) {
        const raw = await response.text();
        let errorMessage = response.statusText;
        try { const asJson = JSON.parse(raw); errorMessage = asJson.error?.message || raw; } catch {}
        logger.error('OpenAI API error response (generateReply):', { tag: 'openaiService', status: response.status, body: raw });
        if (/model|unsupported|not found|unavailable/i.test(errorMessage)) {
          logger.warn('Retrying generateReply with fallback model gpt-4o', { tag: 'openaiService' });
          const fallbackResp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.openai.apiKey}`
            },
            body: JSON.stringify({ model: 'gpt-4o', messages, temperature: 0.3, max_tokens: 1200 })
          });
          if (!fallbackResp.ok) {
            const fallbackRaw = await fallbackResp.text();
            logger.error('Fallback model also failed (generateReply)', { tag: 'openaiService', status: fallbackResp.status, body: fallbackRaw });
            throw new Error(`OpenAI error on fallback: ${fallbackRaw}`);
          }
          const fallbackData = await fallbackResp.json();
          const replyContent = fallbackData.choices[0]?.message?.content?.trim();
          if (!replyContent) throw new Error('OpenAI fallback did not return reply content.');
          return {
            replyText: replyContent,
            suggestedSubject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
            timestamp: new Date().toISOString(),
          };
        }
        throw new Error(`OpenAI API error: ${errorMessage}`);
      }
      const data = await response.json();
    const replyContent = data.choices[0]?.message?.content?.trim();
    if (!replyContent) {
        logger.error('OpenAI response did not contain reply content (generateReply).', {tag: 'openaiService', data});
        throw new Error('OpenAI did not return reply content.');
    }
    return { // generateReply returns an object, unlike generateGuidedReply
        replyText: replyContent,
      suggestedSubject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
        timestamp: new Date().toISOString(),
      };
    } catch (apiError) {
    logger.error('Error during OpenAI API call (generateReply):', {tag: 'openaiService', apiError});
    const fallbackReply = `Hello,\n\nThank you for your email regarding "${originalEmail.subject}". I'll get back to you with more information soon.\n\nBest regards,\nEmail Assistant`;
      return {
        replyText: fallbackReply,
        suggestedSubject: originalEmail.subject.startsWith('Re:') ? originalEmail.subject : `Re: ${originalEmail.subject}`,
        timestamp: new Date().toISOString(),
        error: apiError.message
      };
  }
};

export default {
  classifyEmailForPhotographer, // Kept for now, but main triage is Gemini
  generateReply,              // Kept for auto_draft, now accepts systemGuide
  generateGuidedReply,        // New function for human_input flow
  // generateReplyFromContext is replaced by generateGuidedReply
}; 