import { config } from './src/config/env.js';

async function probeChat(model, body) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify(body ?? {
      model,
      messages: [{ role: 'user', content: 'Say OK' }],
      max_tokens: 10,
    }),
  });
  const text = await resp.text();
  console.log(`\n[Chat] ${model} -> ${resp.status} ${resp.statusText}`);
  console.log(text.substring(0, 500));
}

async function probeResponses(model) {
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify({ model, input: 'Say OK' }),
  });
  const text = await resp.text();
  console.log(`\n[Responses] ${model} -> ${resp.status} ${resp.statusText}`);
  console.log(text.substring(0, 500));
}

if (!config?.openai?.apiKey) {
  console.error('No OPENAI_API_KEY configured.');
  process.exit(2);
}

await probeChat('gpt-5');
await probeChat('gpt-5-mini');
await probeChat('gpt-5-mini', { model: 'gpt-5-mini', messages: [{ role: 'user', content: 'Return {"ok": true}' }], response_format: { type: 'json_object' } });
await probeResponses('gpt-5');
