#!/usr/bin/env node

/**
 * Test Gemini API Connectivity
 * Use this to verify your Gemini API key is working correctly
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './src/config/env.js';

console.log('🔬 Testing Gemini API Connectivity');
console.log('=================================');

if (!config.gemini || !config.gemini.apiKey) {
  console.log('❌ No Gemini API key found');
  console.log('Set GEMINI_API_KEY environment variable');
  process.exit(1);
}

console.log(`✅ Gemini API key found (${config.gemini.apiKey.length} characters)`);
console.log(`   Key starts with: ${config.gemini.apiKey.substring(0, 8)}***`);

try {
  const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  console.log('✅ GoogleGenerativeAI client created');

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" } 
  });
  console.log('✅ Gemini model initialized');

  console.log('\n🧪 Testing simple API call...');
  const simpleResult = await model.generateContent('Return JSON with message "Hello World": {"message": "Hello World"}');
  const simpleResponse = simpleResult.response.text();
  console.log('✅ Simple test successful:', simpleResponse);

  console.log('\n🧪 Testing email categorization...');
  const testPrompt = `Categorize this email:
Subject: Test Business Inquiry
From: client@example.com
Body: Hi, I'm interested in your photography services for my upcoming wedding.

Return JSON:
{
  "category": "Draft Email" | "Invoices" | "Spam",
  "reasoning": "explanation"
}`;

  const testResult = await model.generateContent(testPrompt);
  const testResponse = testResult.response.text();
  console.log('✅ Categorization test successful:', testResponse);

  console.log('\n🎉 All tests passed! Gemini API is working correctly.');
  
} catch (error) {
  console.log('\n❌ Gemini API test failed:');
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
  
  if (error.message.includes('API_KEY_INVALID')) {
    console.log('\n💡 Your API key appears to be invalid');
    console.log('   Get a new key from: https://aistudio.google.com/app/apikey');
  } else if (error.message.includes('quota')) {
    console.log('\n💡 API quota exceeded');
    console.log('   Check your usage at: https://aistudio.google.com/app/apikey');
  } else if (error.message.includes('model')) {
    console.log('\n💡 Model not available');
    console.log('   Try using "gemini-1.5-flash" instead of "gemini-2.0-flash"');
  }
  
  process.exit(1);
} 