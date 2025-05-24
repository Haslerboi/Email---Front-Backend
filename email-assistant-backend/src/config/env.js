// Environment variable configuration
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: join(dirname(__dirname), '..', '.env') });

// Configuration object with all environment variables
export const config = {
  // Server configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Gmail API configuration
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    redirectUri: process.env.GMAIL_REDIRECT_URI,
  },
  
  // OpenAI configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  
  // GMAIL POLLING CONFIG
  GMAIL_CHECK_INTERVAL_MS: process.env.GMAIL_CHECK_INTERVAL_MS, // e.g., 60000 for 1 minute
  GMAIL_INITIAL_DELAY_MS: process.env.GMAIL_INITIAL_DELAY_MS,   // e.g., 5000 for 5 seconds
};

/**
 * Validate format of API keys and credentials
 * @returns {Object} - Object with validation results
 */
export const validateApiKeyFormats = () => {
  const validationResults = {
    isValid: true,
    issues: [],
  };

  // Validate OpenAI API key format (typically starts with "sk-" and is 51 chars)
  if (process.env.OPENAI_API_KEY && 
      (!process.env.OPENAI_API_KEY.startsWith('sk-') || 
       process.env.OPENAI_API_KEY.length < 40)) {
    validationResults.isValid = false;
    validationResults.issues.push(
      'OPENAI_API_KEY has an invalid format. Should start with "sk-" and be at least 40 characters'
    );
  }

  // Validate Gmail credential formats
  if (process.env.GMAIL_CLIENT_ID && 
      !process.env.GMAIL_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    validationResults.isValid = false;
    validationResults.issues.push(
      'GMAIL_CLIENT_ID has an invalid format. Should end with ".apps.googleusercontent.com"'
    );
  }

  return validationResults;
};

// Validate required environment variables
export const validateEnv = () => {
  const baseRequiredEnvVars = [
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
    'OPENAI_API_KEY',
  ];
  
  let requiredEnvVars = [...baseRequiredEnvVars];
  
  if (process.env.NODE_ENV !== 'production') {
    // In development, we might be more lenient or have different checks if needed
    // For example, during some tests, not all might be strictly needed
    // const requiredInDev = ['OPENAI_API_KEY']; 
    // requiredEnvVars = requiredInDev;
  }
  
  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );
  
  if (missingEnvVars.length > 0) {
    const warningMessage = `WARNING: Missing required environment variables: ${missingEnvVars.join(', ')}`;
    console.warn(warningMessage);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(warningMessage.replace('WARNING: ', ''));
    }
  }
  
  const formatValidation = validateApiKeyFormats();
  if (!formatValidation.isValid) {
    const issuesMessage = formatValidation.issues.join('; ');
    console.warn(`VALIDATION WARNING: ${issuesMessage}`);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`API key validation failed: ${issuesMessage}`);
    }
  }
  
  return true;
};

// Call validateEnv but don't throw in development
validateEnv();

export default { config, validateEnv, validateApiKeyFormats }; 