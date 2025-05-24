// Main router that combines all route modules
import { Router } from 'express';
// import smsRoutes from './sms.js'; // To be removed
// import telegramRoutes from './telegram.js'; // To be removed
import { getApiStatus } from '../services/apiStatus.js';
import TaskStateManager from '../services/email-state.js'; // Updated import name
import { generateReplyFromContext } from '../services/openai/index.js'; // Import the new function
import { createDraft } from '../services/gmail/index.js'; // Import createDraft
import logger from '../utils/logger.js'; // Ensure logger is imported if not already

const router = Router();

// Welcome route
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Email Assistant API',
    version: '1.0.0',
    endpoints: {
      // sms: '/api/sms', // Removed
      // telegram: '/api/telegram', // Removed
      status: '/api/status',
      emails_needing_input: '/api/emails-needing-input', // Corrected name
      process_answered_email: '/api/process-answered-email/:inputId'
    },
  });
});

// Mount route modules
// router.use('/sms', smsRoutes); // Removed
// router.use('/telegram', telegramRoutes); // Removed

// Future route modules will be mounted here
// router.use('/emails', emailRoutes); // This was old, we'll add specific new ones
// router.use('/auth', authRoutes); // Auth still not implemented

router.get('/status', async (req, res) => {
  try {
    const status = await getApiStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// This existing /emails endpoint will be replaced or removed.
// For now, let's comment it out to avoid conflict with the new one we plan.
/*
router.get('/emails', (req, res) => {
  try {
    const emails = EmailStateManager.listActiveEmails();
    res.json({ emails });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});
*/

// GET /api/emails-needing-input endpoint
router.get('/emails-needing-input', (req, res) => {
  try {
    const tasks = TaskStateManager.listPendingTasks();
    // Ensure the response structure matches frontend expectations
    // The frontend mock data for an item is: { id, originalEmail, draftWithQuestionsTemplate, questions }
    // TaskStateManager stores the full task object which should be compatible.
    res.json(tasks); 
  } catch (error) {
    logger.error('Error fetching emails needing input:', { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to retrieve tasks' });
  }
});

// POST /api/process-answered-email/:inputId endpoint
router.post('/process-answered-email/:inputId', async (req, res) => {
  const { inputId } = req.params;
  const  frontendAnswers = req.body.answers; // Assuming frontend sends { answers: { q_id: 'ans'} }

  if (!frontendAnswers) {
    return res.status(400).json({ status: 'error', message: 'Answers not provided in request body.'});
  }

  console.log(`Backend: Received answers for task ${inputId}:`, frontendAnswers);
  
  try {
    const task = TaskStateManager.getTask(inputId);
    if (!task) {
      logger.warn(`Task ${inputId} not found for processing.`);
      return res.status(404).json({ status: 'error', message: `Task ${inputId} not found.` });
    }

    // Prepare answeredQuestions array for generateReplyFromContext
    // It expects [{ questionText: '...', userAnswer: '...' }]
    // The task.questions is [{ id: '...', text: '...' }]
    // The frontendAnswers is { question_id_from_task: 'user answer' }
    const preparedAnsweredQuestions = task.questions.map(q => ({
      questionText: q.text,
      userAnswer: frontendAnswers[q.id] || 'No answer provided' // Use question ID from task.questions to find answer
    }));

    logger.info(`Generating reply for task ${inputId} with prepared answers.`);
    const replyText = await generateReplyFromContext(task.originalEmail, preparedAnsweredQuestions);

    if (!replyText || replyText.includes('(Error communicating with AI assistant)') || replyText.includes('(OpenAI key not configured)')){
        logger.error(`Failed to generate reply text from OpenAI for task ${inputId}. Reply was: ${replyText}`);
        // Don't remove task, let it be tried again or flagged
        return res.status(500).json({ status: 'error', message: 'Failed to generate reply from AI. Task not processed.' });
    }

    logger.info(`Reply generated for task ${inputId}. Attempting to create draft in Gmail.`);
    await createDraft(
      task.originalEmail.threadId,
      task.originalEmail.sender, // Replying to the original sender
      task.originalEmail.subject,
      replyText
    );
    logger.info(`Gmail draft created for task ${inputId}.`);

    // If all successful, remove the task
    await TaskStateManager.removeTask(inputId);
    logger.info(`Task ${inputId} processed and removed successfully.`);

    res.json({
      message: `Answers for task ${inputId} processed. Email draft created in Gmail.`,
      nextStep: 'Review the draft in your Gmail drafts folder.'
    });

  } catch (error) {
    logger.error(`Error processing task ${inputId}:`, { errorMessage: error.message, stack: error.stack });
    // We might not want to send the full error.stack to client
    res.status(500).json({ status: 'error', message: `Failed to process task: ${error.message}` });
  }
});

export default router; 