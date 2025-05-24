// Main router that combines all route modules
import { Router } from 'express';
// import smsRoutes from './sms.js'; // To be removed
// import telegramRoutes from './telegram.js'; // To be removed
import { getApiStatus } from '../services/apiStatus.js';
import TaskStateManager from '../services/email-state.js'; // Updated import name

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
router.post('/process-answered-email/:inputId', async (req, res) => { // Made async for removeTask
  const { inputId } = req.params;
  const { answers } = req.body; 
  console.log(`Backend: Received answers for task ${inputId}:`, answers);
  
  // TODO: Add actual processing logic here:
  // 1. Fetch the original task data: const task = TaskStateManager.getTask(inputId);
  //    If !task, return 404.
  // 2. Use task.originalEmail.body and the new `answers` to formulate a prompt for OpenAI.
  // 3. Call OpenAI to generate the final email draft.
  // 4. Draft the email in Gmail using `task.originalEmail.id` (for threading) and the OpenAI response.
  // 5. If all successful, remove the task:
  //    await TaskStateManager.removeTask(inputId);

  // For now, just mock success and remove task
  try {
    const removed = await TaskStateManager.removeTask(inputId);
    if (!removed) {
      // This could happen if the task was already processed/removed by another request
      // or if the inputId is invalid.
      logger.warn(`Task ${inputId} not found or already removed during POST /process-answered-email.`);
      // Depending on desired behavior, you might return a 404 or a specific message.
      // For now, let's still indicate some form of processing.
    }

    res.json({
      message: `Answers for task ${inputId} received by backend. Mock processing complete.`,
      nextStep: 'Email draft (mock) should be in Gmail.'
    });
  } catch (error) {
    logger.error(`Error processing task ${inputId}:`, { error: error.message, stack: error.stack });
    res.status(500).json({ status: 'error', message: 'Failed to process task' });
  }
});

export default router; 