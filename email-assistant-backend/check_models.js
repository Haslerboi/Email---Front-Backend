import { config } from './src/config/env.js';

async function main() {
  try {
    if (!config?.openai?.apiKey) {
      console.error('No OPENAI_API_KEY found in config.');
      process.exit(2);
    }
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`Models endpoint error: ${resp.status} ${resp.statusText}`);
      console.log(text);
      process.exit(1);
    }
    const data = JSON.parse(text);
    const ids = (data?.data || []).map(m => m.id);
    const matches = ids.filter(id => /^gpt-5(-mini)?$/.test(id));
    console.log('Found models:', matches.length ? matches.join(', ') : '(none)');
  } catch (e) {
    console.error('Exception:', e.message);
    process.exit(1);
  }
}

main();
