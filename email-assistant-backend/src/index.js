// Main entry point for the Email Assistant application
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { checkForNewEmails } from './services/gmail/index.js';
// import telegramPolling from './services/telegram/polling.js'; // Removed
import logger from './utils/logger.js';

const app = express();
const PORT = config.PORT || 3000;
const APP_INSTANCE_ID = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

// Configure logger with instance ID
logger.info(`Starting server instance ${APP_INSTANCE_ID}`, { instanceId: APP_INSTANCE_ID });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/api', routes);

// Health check route
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Email Assistant API is running',
    instanceId: APP_INSTANCE_ID
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Starting server instance ${APP_INSTANCE_ID}`, { instanceId: APP_INSTANCE_ID });
  console.log(`Server running on port ${PORT} in ${config.NODE_ENV} mode`);
  console.log(`Instance ID: ${APP_INSTANCE_ID}`);
  console.log(`http://localhost:${PORT}`);
});

// Removed Telegram webhook and polling logic
// The if (config.telegram.useWebhook) block and its else counterpart have been removed.

// ✅ Gmail polling loop (This is important and kept)
const GMAIL_CHECK_INTERVAL = config.GMAIL_CHECK_INTERVAL_MS || (60 * 1000); // 1 minute default, configurable
let gmailCheckCount = 0;

const checkGmail = () => {
  gmailCheckCount++;
  console.log(`🔍 Checking Gmail... (Check #${gmailCheckCount}, Instance ${APP_INSTANCE_ID})`);
  
  const jitter = (Math.random() * 10000) - 5000; // Add jitter +/- 5 seconds to base interval
  const nextCheckDelay = GMAIL_CHECK_INTERVAL + jitter;
  
  checkForNewEmails() // This function now needs to be the one that potentially creates tasks for the frontend
    .catch(error => {
      logger.error('Error during checkForNewEmails:', { error: error.message, stack: error.stack });
    })
    .finally(() => {
      // Ensure timeout is positive
      setTimeout(checkGmail, Math.max(5000, nextCheckDelay)); // Minimum 5 second delay
    });
};

// Start Gmail checking with initial delay to reduce startup load
// And add a small random jitter to the initial start as well
const initialDelay = (config.GMAIL_INITIAL_DELAY_MS || 15000) + Math.floor(Math.random() * 5000);
setTimeout(checkGmail, initialDelay);
console.log(`Gmail polling will start in approximately ${Math.round(initialDelay/1000)} seconds.`);

export default app;