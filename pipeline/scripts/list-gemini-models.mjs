// List available Gemini models for your API key.
// Run: node pipeline/scripts/list-gemini-models.mjs
// Look for models that support generateContent and have imageGeneration in their supportedGenerationMethods.
import { loadEnv, log } from './lib.mjs';

loadEnv();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('GEMINI_API_KEY not set in .env');
  process.exit(1);
}

const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
  headers: { 'x-goog-api-key': key },
});
if (!res.ok) {
  console.error(`Failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}

const data = await res.json();
const models = (data.models || [])
  .filter((m) => m.name.includes('gemini'))
  .map((m) => ({
    name: m.name.replace('models/', ''),
    display: m.displayName,
    methods: m.supportedGenerationMethods || [],
    description: m.description || '',
  }));

console.log('\n=== Gemini Models ===\n');
for (const m of models) {
  const hasImage = m.methods.includes('generateContent') && m.methods.some((x) => x.toLowerCase().includes('image'));
  const flag = hasImage ? ' [IMG]' : '';
  console.log(`${m.name}${flag}`);
  console.log(`  Display: ${m.display}`);
  console.log(`  Methods: ${m.methods.join(', ')}`);
  if (m.description) console.log(`  Desc: ${m.description.slice(0, 120)}`);
  console.log('');
}

console.log('Set GEMINI_MODEL in .env to the model name (without "models/" prefix).');
console.log('Look for models that support generateContent and image generation.');
