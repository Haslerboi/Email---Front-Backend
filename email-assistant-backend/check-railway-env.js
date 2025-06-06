#!/usr/bin/env node

/**
 * Railway Environment Configuration Checker
 * Run this script to validate all required environment variables are set
 */

console.log('🚀 Railway Environment Configuration Checker');
console.log('=' * 50);

const requiredEnvVars = [
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET', 
  'GMAIL_REFRESH_TOKEN',
  'GMAIL_REDIRECT_URI',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY'
];

const optionalEnvVars = [
  'PORT',
  'NODE_ENV',
  'GMAIL_CHECK_INTERVAL_MS',
  'GMAIL_INITIAL_DELAY_MS'
];

const railwayEnvVars = [
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_PROJECT_ID'
];

let hasErrors = false;

console.log('\n📋 Checking Required Environment Variables:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value) {
    const displayValue = envVar.includes('KEY') || envVar.includes('SECRET') || envVar.includes('TOKEN') 
      ? `${value.substring(0, 8)}***${value.substring(value.length - 4)}`
      : value.length > 50 
        ? `${value.substring(0, 47)}...`
        : value;
    console.log(`✅ ${envVar}: ${displayValue}`);
  } else {
    console.log(`❌ ${envVar}: NOT SET`);
    hasErrors = true;
  }
});

console.log('\n📋 Checking Optional Environment Variables:');
optionalEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value) {
    console.log(`✅ ${envVar}: ${value}`);
  } else {
    console.log(`⚠️  ${envVar}: NOT SET (using default)`);
  }
});

console.log('\n🚂 Railway Specific Variables:');
railwayEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value) {
    console.log(`✅ ${envVar}: ${value}`);
  } else {
    console.log(`ℹ️  ${envVar}: NOT SET`);
  }
});

console.log('\n🔍 Environment Summary:');
console.log(`Node.js Version: ${process.version}`);
console.log(`Platform: ${process.platform}`);
console.log(`Architecture: ${process.arch}`);
console.log(`Is Railway: ${!!process.env.RAILWAY_ENVIRONMENT}`);
console.log(`Port: ${process.env.PORT || (process.env.RAILWAY_ENVIRONMENT ? 8080 : 3000)}`);

if (hasErrors) {
  console.log('\n❌ Configuration has errors! Please set the missing environment variables.');
  console.log('\nTo set environment variables in Railway:');
  console.log('1. Go to your Railway project dashboard');
  console.log('2. Click on your service');
  console.log('3. Go to Variables tab');
  console.log('4. Add the missing variables');
  process.exit(1);
} else {
  console.log('\n✅ All required environment variables are configured!');
  console.log('🎉 Your Email Assistant should work properly on Railway.');
  process.exit(0);
} 