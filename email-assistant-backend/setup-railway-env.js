#!/usr/bin/env node

/**
 * Railway Environment Setup Helper
 * This script helps set up environment variables for Railway deployment
 */

import { execSync } from 'child_process';

console.log('🚂 Railway Environment Setup Helper');
console.log('=====================================');

// NOTE: Replace these with your actual values when setting up Railway
const envVars = {
  'GMAIL_CLIENT_ID': 'your-gmail-client-id.apps.googleusercontent.com',
  'GMAIL_CLIENT_SECRET': 'your-gmail-client-secret', 
  'GMAIL_REFRESH_TOKEN': 'your-gmail-refresh-token',
  'OPENAI_API_KEY': 'your-openai-api-key',
  'NODE_ENV': 'production',
  'GMAIL_CHECK_INTERVAL_MS': '60000',
  'GMAIL_INITIAL_DELAY_MS': '30000'
};

const requiredManualSetup = [
  'GEMINI_API_KEY',
  'GMAIL_REDIRECT_URI'
];

console.log('\n📝 These environment variables can be set automatically:');
for (const [key, value] of Object.entries(envVars)) {
  const displayValue = key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN')
    ? `${value.substring(0, 8)}***${value.substring(value.length - 4)}`
    : value;
  console.log(`  ${key}=${displayValue}`);
}

console.log('\n⚠️  These require manual setup:');
requiredManualSetup.forEach(key => {
  switch(key) {
    case 'GEMINI_API_KEY':
      console.log(`  ${key}: Get from https://aistudio.google.com/app/apikey`);
      break;
    case 'GMAIL_REDIRECT_URI':
      console.log(`  ${key}: https://your-railway-domain.railway.app/auth/google/callback`);
      break;
    default:
      console.log(`  ${key}: Manual setup required`);
  }
});

console.log('\n🔧 To set these in Railway:');
console.log('1. Go to your Railway project dashboard');
console.log('2. Click on your service');
console.log('3. Go to Variables tab');
console.log('4. Add each environment variable');

console.log('\n📋 Railway CLI Commands (if you have Railway CLI installed):');
console.log('railway login');
console.log('railway link');

Object.entries(envVars).forEach(([key, value]) => {
  console.log(`railway variables --set ${key}="${value}"`);
});

console.log('\n🎯 Manual setup required for:');
requiredManualSetup.forEach(key => {
  console.log(`railway variables --set ${key}="YOUR_VALUE_HERE"`);
});

console.log('\n✨ After setting all variables, deploy with:');
console.log('railway up');

console.log('\n🔍 Test deployment with:');
console.log('curl https://your-app.railway.app/api/status');

export default { envVars, requiredManualSetup }; 