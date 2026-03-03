import { execFileSync } from 'node:child_process';

const LLM_BIN = process.env.MEMOMO_LLM_BIN || 'llama-cli';
const LLM_MODEL = process.env.MEMOMO_LLM_MODEL || '';

function extractJsonArray(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (Array.isArray(arr)) return arr;
  } catch {
    return null;
  }
  return null;
}

function fallbackTags(content) {
  return [...new Set(
    content
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3)
  )].slice(0, 5);
}

function runLlama(prompt, nPredict = 120) {
  if (!LLM_MODEL) {
    throw new Error('MEMOMO_LLM_MODEL is not configured');
  }

  const args = [
    '-m', LLM_MODEL,
    '-p', prompt,
    '-n', String(nPredict),
    '--temp', '0.2',
    '--top-k', '40',
    '--top-p', '0.9',
    '--no-display-prompt'
  ];

  return execFileSync(LLM_BIN, args, { encoding: 'utf8', timeout: 20_000 });
}

export function suggestTags(content) {
  try {
    const prompt = `You generate concise memo tags. Return JSON array only. Max 5 tags.\nMemo:\n${content}`;
    const output = runLlama(prompt, 80);
    const parsed = extractJsonArray(output);
    if (parsed && parsed.length) {
      return parsed.map((x) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 5);
    }
  } catch {
    // fallback below
  }
  return fallbackTags(content);
}

export function summarizeResults(question, snippets) {
  if (!snippets.length) return '該当ノートは見つかりませんでした。';

  try {
    const joined = snippets.map((x, i) => `[${i + 1}] ${x}`).join('\n');
    const prompt = `Summarize the memo search results for this query in Japanese within 120 characters.\nQuery: ${question}\nResults:\n${joined}`;
    const output = runLlama(prompt, 120).trim();
    if (output) return output.split('\n').slice(-1)[0].trim();
  } catch {
    // fallback below
  }

  return snippets.map((x) => x.slice(0, 80)).join(' / ');
}
