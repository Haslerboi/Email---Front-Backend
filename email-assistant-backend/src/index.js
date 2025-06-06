// Main entry point for the Email Assistant application
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/env.js';
import routes from './routes/index.js';
import { checkForNewEmails, checkWhiteLabelForUpdates, processPendingNotifications } from './services/gmail/index.js';
import ProcessedEmailsService from './services/processedEmails.js';
// import telegramPolling from './services/telegram/polling.js'; // Removed
import logger from './utils/logger.js';

console.log(`DEBUG: Railway process.env.PORT is: ${process.env.PORT}`); // Log the PORT Railway provides

const app = express();
const PORT = config.PORT; // Rely purely on config.PORT now, which should pick up process.env.PORT
console.log(`DEBUG: App will listen on PORT: ${PORT} (from config)`);
const APP_INSTANCE_ID = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

// Configure logger with instance ID
logger.info(`Starting server instance ${APP_INSTANCE_ID}`, { instanceId: APP_INSTANCE_ID });

// Log Railway and configuration status for debugging
logger.info('Environment and configuration status:', {
  instanceId: APP_INSTANCE_ID,
  isRailway: !!process.env.RAILWAY_ENVIRONMENT,
  railwayService: process.env.RAILWAY_SERVICE_NAME || 'unknown',
  railwayProject: process.env.RAILWAY_PROJECT_ID || 'unknown',
  hasGmailConfig: !!(config.gmail.clientId && config.gmail.clientSecret && config.gmail.refreshToken),
  hasOpenAIKey: !!config.openai.apiKey,
  hasGeminiKey: !!config.gemini.apiKey,
  nodeEnv: config.NODE_ENV,
  port: config.PORT,
  platform: process.platform,
  nodeVersion: process.version
});

// --- Explicit CORS Configuration ---
const allowedOrigins = [
  'http://localhost:5173', // Your local frontend
  // Add your deployed frontend URL here if you deploy it later
  // e.g., 'https://your-frontend-domain.com' 
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // If you plan to use cookies or authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
// --- End Explicit CORS Configuration ---

// Middleware
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
const GMAIL_CHECK_INTERVAL = config.GMAIL_CHECK_INTERVAL_MS || (2 * 60 * 1000); // 2 minutes default, configurable
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

// Temporarily increase initial delay significantly for Railway testing
const configuredInitialDelay = parseInt(process.env.GMAIL_INITIAL_DELAY_MS, 10) || 60000; // Default to 60 seconds
const initialJitter = Math.floor(Math.random() * 5000);
const initialDelay = configuredInitialDelay + initialJitter;

setTimeout(checkGmail, initialDelay);
console.log(`Gmail polling will start in approximately ${Math.round(initialDelay/1000)} seconds.`);

// ✅ Whitelist checking loop (checks 'white' folder every 2 minutes)
const WHITELIST_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
let whitelistCheckCount = 0;

const checkWhitelistFolder = () => {
  whitelistCheckCount++;
  console.log(`🔍 Checking whitelist folder... (Check #${whitelistCheckCount}, Instance ${APP_INSTANCE_ID})`);
  
  Promise.all([
    checkWhiteLabelForUpdates(),
    // Run cleanup every 10 checks (every 20 minutes)
    whitelistCheckCount % 10 === 0 ? ProcessedEmailsService.cleanup() : Promise.resolve()
  ])
    .catch(error => {
      logger.error('Error during whitelist/cleanup check:', { error: error.message, stack: error.stack });
    })
    .finally(() => {
      setTimeout(checkWhitelistFolder, WHITELIST_CHECK_INTERVAL);
    });
};

// Start whitelist checking with initial delay
const whitelistInitialDelay = 30000; // 30 seconds
setTimeout(checkWhitelistFolder, whitelistInitialDelay);
console.log(`Whitelist checking will start in approximately ${Math.round(whitelistInitialDelay/1000)} seconds.`);

// ✅ Notification processing loop (checks pending notifications every minute)
const NOTIFICATION_CHECK_INTERVAL = 60 * 1000; // 1 minute
let notificationCheckCount = 0;

const checkPendingNotifications = () => {
  notificationCheckCount++;
  console.log(`🔔 Checking pending notifications... (Check #${notificationCheckCount}, Instance ${APP_INSTANCE_ID})`);
  
  processPendingNotifications()
    .catch(error => {
      logger.error('Error during processPendingNotifications:', { error: error.message, stack: error.stack });
    })
    .finally(() => {
      setTimeout(checkPendingNotifications, NOTIFICATION_CHECK_INTERVAL);
    });
};

// Start notification checking with initial delay
const notificationInitialDelay = 45000; // 45 seconds
setTimeout(checkPendingNotifications, notificationInitialDelay);
console.log(`Notification processing will start in approximately ${Math.round(notificationInitialDelay/1000)} seconds.`);

export default app;