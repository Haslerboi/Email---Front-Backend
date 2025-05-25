// Main router that combines all route modules
import { Router } from 'express';
// import smsRoutes from './sms.js'; // To be removed
// import telegramRoutes from './telegram.js'; // To be removed
import { getApiStatus } from '../services/apiStatus.js';
import TaskStateManager from '../services/email-state.js'; // Updated import name
// import { generateReplyFromContext } from '../services/openai/index.js'; // Old function
import { generateGuidedReply } from '../services/openai/index.js'; // New function
import { getGuidanceForCategory } from '../services/templateManager.js'; // Import template manager
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
  const frontendAnswers = req.body.answers;

  if (!frontendAnswers) {
    return res.status(400).json({ status: 'error', message: 'Answers not provided.' });
  }
  logger.info(`Processing answers for task ${inputId}`, { inputId, frontendAnswers });

  try {
    const task = TaskStateManager.getTask(inputId);
    if (!task) {
      logger.warn(`Task ${inputId} not found for processing answers.`);
      return res.status(404).json({ status: 'error', message: `Task ${inputId} not found.` });
    }
    if (!task.originalEmail || !task.questions || !task.category) {
        logger.error(`Task ${inputId} is missing critical data (originalEmail, questions, or category).`, { task });
        return res.status(500).json({ status: 'error', message: 'Task data is incomplete.' });
    }

    const preparedAnsweredQuestions = task.questions.map(q => ({
      questionText: q.text,
      userAnswer: frontendAnswers[q.id] || 'No answer provided'
    }));

    logger.info(`Fetching guide for category: ${task.category}`, { inputId });
    const systemGuide = await getGuidanceForCategory(task.category);
    if (!systemGuide || systemGuide.includes("Please provide a helpful")) { // Check for fallback guide indicating error
        logger.error(`Could not load a valid system guide for category ${task.category} for task ${inputId}. Using basic fallback.`, { systemGuide });
        // Potentially use a very generic system prompt if load fails critically
    }

    logger.info(`Generating guided reply for task ${inputId} using GPT-4.1 (or similar premium model).`, { inputId });
    const replyText = await generateGuidedReply(systemGuide, task.originalEmail, preparedAnsweredQuestions);

    if (!replyText || replyText.includes('(Error communicating with AI assistant)') || replyText.includes('(OpenAI key not configured)')){
      logger.error(`Failed to generate reply text from OpenAI for task ${inputId}. Reply was: ${replyText}`, { inputId });
      return res.status(500).json({ status: 'error', message: 'Failed to generate reply from AI. Task not processed.' });
    }

    logger.info(`Reply generated for task ${inputId}. Attempting to create draft in Gmail.`, { inputId });
    await createDraft(
      task.originalEmail.threadId,
      task.originalEmail.sender,
      task.originalEmail.subject,
      replyText
    );
    logger.info(`Gmail draft created for task ${inputId}.`, { inputId });

    await TaskStateManager.removeTask(inputId);
    logger.info(`Task ${inputId} processed and removed successfully.`, { inputId });

    res.json({
      message: `Answers for task ${inputId} processed. Email draft created in Gmail.`,
      nextStep: 'Review the draft in your Gmail drafts folder.'
    });

  } catch (error) {
    logger.error(`Error processing task ${inputId}:`, { inputId, errorMessage: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: `Failed to process task ${inputId}: ${error.message}` });
  }
});

// DELETE /api/tasks/:taskId endpoint (New)
router.delete('/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  logger.info(`Backend: Received request to delete task ${taskId}`);
  try {
    const removed = await TaskStateManager.removeTask(taskId);
    if (removed) {
      logger.info(`Task ${taskId} deleted successfully from backend.`);
      res.status(200).json({ message: `Task ${taskId} deleted successfully.` });
    } else {
      logger.warn(`Task ${taskId} not found for deletion.`);
      res.status(404).json({ status: 'error', message: `Task ${taskId} not found.` });
    }
  } catch (error) {
    logger.error(`Error deleting task ${taskId}:`, { errorMessage: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: `Failed to delete task ${taskId}: ${error.message}` });
  }
});

export default router; 