#!/usr/bin/env node

/**
 * Test Gemini API Connectivity
 * Use this to verify your Gemini API key is working correctly
 */

import { config } from './src/config/env.js';

console.log('🔬 Testing OpenAI gpt-5-mini Connectivity');
console.log('========================================');

if (!config.openai || !config.openai.apiKey) {
  console.log('❌ No OpenAI API key found');
  console.log('Set OPENAI_API_KEY environment variable');
  process.exit(1);
}

console.log(`✅ OpenAI API key found (${config.openai.apiKey.length} characters)`);
console.log(`   Key starts with: ${config.openai.apiKey.substring(0, 8)}***`);

try {
  console.log('\n🧪 Testing simple API call...');
  const simpleResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Return JSON exactly: {"message": "Hello World"}' }],
      temperature: 0,
      max_tokens: 50,
      response_format: { type: 'json_object' }
    })
  });
  const simpleData = await simpleResponse.json();
  const simpleText = simpleData.choices[0]?.message?.content;
  console.log('✅ Simple test successful:', simpleText);

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

  const catResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: testPrompt }],
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    })
  });
  const catData = await catResponse.json();
  const testResponse = catData.choices[0]?.message?.content;
  console.log('✅ Categorization test successful:', testResponse);

  console.log('\n🎉 All tests passed! Gemini API is working correctly.');
  
} catch (error) {
  console.log('\n❌ OpenAI API test failed:');
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
  if (error.message.includes('incorrect_api_key') || error.message.includes('401')) {
    console.log('\n💡 Your OpenAI API key appears to be invalid');
    console.log('   Set a valid OPENAI_API_KEY');
  } else if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
    console.log('\n💡 API quota exceeded');
    console.log('   Check your usage and billing in your OpenAI account');
  }
  
  process.exit(1);
} 