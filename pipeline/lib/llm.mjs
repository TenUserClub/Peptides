import { loadEnv, log } from '../scripts/lib.mjs';

loadEnv();

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_OPENAI_CALLS_PER_RUN = positiveInt(process.env.OPENAI_MAX_CALLS_PER_RUN, 30);
const MAX_OPENAI_OUTPUT_TOKENS_PER_RUN = positiveInt(process.env.OPENAI_MAX_OUTPUT_TOKENS_PER_RUN, 60000);
const OPENAI_TIMEOUT_MS = positiveInt(process.env.OPENAI_TIMEOUT_MS, 90000);
let openAICalls = 0;
let reservedOutputTokens = 0;

/**
 * Call the OpenAI Chat Completions API.
 * Retries with exponential backoff on 429 (rate limit) and 5xx errors.
 */
export async function chat({ system, user, model = 'gpt-4.1', temperature = 0.7, jsonMode = false, maxTokens = 4000 }) {
  const openAIKey = process.env.OPENAI_API_KEY || '';
  if (!openAIKey) throw new Error('OPENAI_API_KEY is required for this stage');
  if (openAICalls >= MAX_OPENAI_CALLS_PER_RUN) {
    throw new Error(`OpenAI per-run call budget reached (${MAX_OPENAI_CALLS_PER_RUN})`);
  }
  if (reservedOutputTokens + maxTokens > MAX_OPENAI_OUTPUT_TOKENS_PER_RUN) {
    throw new Error(`OpenAI per-run output-token budget would exceed ${MAX_OPENAI_OUTPUT_TOKENS_PER_RUN}`);
  }
  openAICalls += 1;
  reservedOutputTokens += maxTokens;
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = await res.json();
      const usage = data.usage ? `(${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out)` : '';
      log('info', `OpenAI ${model}: ${usage}`);
      return data.choices[0].message.content;
    }

    const text = await res.text();

    // Retry on rate limit (429) and server errors (5xx)
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number.parseFloat(res.headers.get('retry-after') || '');
      const delay = Number.isFinite(retryAfter)
        ? Math.min(60000, Math.max(1000, retryAfter * 1000))
        : 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
      log('warn', `OpenAI ${res.status} — retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    log('error', `OpenAI API error: ${res.status} ${text}`);
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }

  throw new Error('OpenAI: max retries exceeded');
}
