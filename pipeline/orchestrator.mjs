#!/usr/bin/env node
/**
 * Peptide SEO Pipeline Orchestrator
 * Replaces the Claude Code agent architecture with OpenAI + Kimi orchestration.
 *
 * Usage:
 *   node orchestrator.mjs [--stage=all|fetch-news|fetch-clinics|fetch-doctors|
 *                          verify|write-news|write-blog|write-clinics|write-doctors|write-updates|
 *                          humanise|publish|monitor]
 *
 * Environment: .env (OPENAI_API_KEY, EXA_API_KEY, optional GEMINI and Supabase keys)
 */

import { join, dirname, basename, relative } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync, unlinkSync,
} from 'node:fs';
import { loadEnv, readJson, writeJson, log, PIPELINE, ROOT } from './scripts/lib.mjs';
import { chat } from './lib/llm.mjs';
import { generateImage } from './lib/images.mjs';
import { isAuthoritativeUrl, validateContent } from './lib/content-guard.mjs';
import { canonicalBlogPost, canonicalClinicPost, chooseSingleNpiMatch, normalizeHttpUrl } from './lib/pipeline-utils.mjs';
import {
  startRun, finishRun, upsertClinic, upsertDoctor, upsertPublishedPost,
  upsertKeywordMetrics, getKeywordSignals, pruneKeywordMetrics, setQueueState,
} from './lib/db.mjs';
import { fetchSearchQueries, isConfigured as isSearchConsoleConfigured } from './lib/search-console.mjs';

loadEnv();

const rawDomain = process.env.SITE_DOMAIN || '';
const SITE_DOMAIN = rawDomain && !rawDomain.startsWith('#')
  ? rawDomain.trim()
  : 'mypeptide.club';

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  models: {
    writing: process.env.OPENAI_WRITING_MODEL || 'gpt-4.1',
    humanise: process.env.OPENAI_HUMANISE_MODEL || 'gpt-4.1',
    verify: process.env.OPENAI_VERIFY_MODEL || 'gpt-4.1-mini',
    summary: process.env.OPENAI_SUMMARY_MODEL || 'gpt-4.1-mini',
  },
  velocity: {
    maxNewsPerDay: 3,
    maxLegalPerDay: 3,
    maxDirPerDay: 5,
    maxBlogPerDay: 1,
    maxHumanisePerRun: 10,
    maxPublishPerRun: 10,
  },
  web: {
    maxRetries: 2,
    timeout: 15000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },
};

const DRY_RUN = process.argv.includes('--dry-run');

// ── Content helpers ────────────────────────────────────────────
function readText(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try { return readFileSync(path, 'utf8'); } catch { return fallback; }
}

function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function stripMarkdownFences(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[\w]*\n?/, '');
    cleaned = cleaned.replace(/\n?```\s*$/, '');
    cleaned = cleaned.trim();
  }
  return cleaned;
}

function parseFrontmatter(text) {
  const cleaned = stripMarkdownFences(text);

  // Handle both LF and CRLF line endings
  const normalized = cleaned.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return null;

  const lines = match[1].split('\n').filter((l) => l.trim());
  const data = {};
  for (const line of lines) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();

    // Strip surrounding quotes
    value = value.replace(/^["']|["']$/g, '');

    // Parse arrays: ["a", "b"] or [a, b]
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        data[m[1]] = JSON.parse(value.replace(/'/g, '"'));
        continue;
      } catch {
        // fall through to string
      }
    }

    // Parse booleans and numbers
    if (value === 'true') { data[m[1]] = true; continue; }
    if (value === 'false') { data[m[1]] = false; continue; }
    if (/^\d+$/.test(value)) { data[m[1]] = parseInt(value, 10); continue; }
    if (/^\d+\.\d+$/.test(value)) { data[m[1]] = parseFloat(value); continue; }

    data[m[1]] = value;
  }
  return { data, body: match[2] };
}

function extractDate(text) {
  const m = text.match(/publishDate:\s*(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractTitle(text) {
  const m = text.match(/title:\s*["']?(.*?)["']?\n/);
  return m ? m[1] : null;
}

function findFiles(dir, pattern = /\.md$/, excludePattern = null) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFiles(path, pattern, excludePattern));
    } else if (entry.name.match(pattern) && (!excludePattern || !entry.name.match(excludePattern))) {
      files.push(path);
    }
  }
  return files;
}

function listFiles(dir, pattern = /.*/) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.match(pattern))
    .map((e) => join(dir, e.name));
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function readableText(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Web fetch ──────────────────────────────────────────────────
async function webFetch(url, opts = {}) {
  const { maxRetries = CONFIG.web.maxRetries, timeout = CONFIG.web.timeout } = opts;
  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) throw new Error(`Invalid HTTP URL: ${url}`);
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': CONFIG.web.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === maxRetries) throw e;
      log('warn', `webFetch retry ${i + 1} for ${normalizedUrl}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${normalizedUrl}`);
}

// ── Content directory routing (multi-site) ──────────────────────
function contentDirFor(collection) {
  if (collection === 'clinics') return join(ROOT, 'site', 'src', 'content', 'clinics');
  if (collection === 'doctors') return join(ROOT, 'sites', 'doctors', 'src', 'content', 'doctors');
  if (collection === 'news') return join(ROOT, 'sites', 'news', 'src', 'content', 'news');
  if (collection === 'updates') return join(ROOT, 'sites', 'updates', 'src', 'content', 'updates');
  return join(ROOT, 'sites', 'content', 'src', 'content', collection);
}

function siteDirFor(collection) {
  if (collection === 'clinics') return join(ROOT, 'site');
  if (collection === 'doctors') return join(ROOT, 'sites', 'doctors');
  if (collection === 'news') return join(ROOT, 'sites', 'news');
  if (collection === 'updates') return join(ROOT, 'sites', 'updates');
  return join(ROOT, 'sites', 'content');
}

// ── Count helpers ──────────────────────────────────────────────
function countToday(collection, date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  const dir = contentDirFor(collection);
  if (!existsSync(dir)) return 0;
  return findFiles(dir, /\.md$/, /_sample|\.diff\.md/)
    .filter((p) => extractDate(readText(p)) === d)
    .length;
}

function allTitles(collection) {
  const dir = contentDirFor(collection);
  if (!existsSync(dir)) return [];
  return findFiles(dir, /\.md$/, /_sample|\.diff\.md/)
    .map((p) => extractTitle(readText(p)))
    .filter(Boolean);
}

// ── Stage: Fetch ───────────────────────────────────────────────
function keywordOpportunityScore(topic, signals) {
  const phrases = [topic.keyword, ...(topic.supportingKeywords || [])]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return signals.reduce((score, signal) => {
    const query = String(signal.keyword || '').trim().toLowerCase();
    const matches = query && phrases.some((phrase) => query === phrase ||
      (query.length >= 12 && (query.includes(phrase) || phrase.includes(query))));
    if (!matches) return score;
    const impressions = Number(signal.impressions || 0);
    const ctr = Math.max(0, Math.min(1, Number(signal.ctr || 0)));
    const position = Number(signal.position || 100);
    const positionWeight = position >= 4 && position <= 30 ? 1.5 : 1;
    return score + impressions * (1 - ctr) * positionWeight;
  }, 0);
}

async function runSyncKeywords() {
  log('info', 'orchestrator: sync-keywords');
  if (DRY_RUN) {
    log('info', `DRY RUN: would sync ${isSearchConsoleConfigured() ? 'Search Console queries' : 'editorial seed keywords'} into Supabase`);
    return 0;
  }
  if (!isSearchConsoleConfigured()) {
    const today = new Date().toISOString().slice(0, 10);
    const checkedAt = new Date().toISOString();
    const topicQueue = readJson(join(PIPELINE, 'queue', 'blog-topics.json'), { topics: [] });
    const keywords = new Set((topicQueue.topics || []).flatMap((topic) =>
      [topic.keyword, ...(topic.supportingKeywords || [])].map((value) => String(value || '').trim().toLowerCase())
    ).filter(Boolean));
    const seedRows = [...keywords].map((keyword) => ({
      source: 'editorial_seed',
      property: 'network',
      keyword,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
      period_start: today,
      period_end: today,
      checked_at: checkedAt,
      updated_at: checkedAt,
    }));
    const saved = await upsertKeywordMetrics(seedRows);
    log('info', `sync-keywords: saved ${saved} editorial seed keywords to Supabase`);
    return saved;
  }
  const existing = await getKeywordSignals(1);
  const today = new Date().toISOString().slice(0, 10);
  if (existing[0]?.checked_at?.slice(0, 10) === today) {
    log('info', 'sync-keywords: today\'s Search Console snapshot already exists');
    return 0;
  }
  const metrics = await fetchSearchQueries();
  const saved = await upsertKeywordMetrics(metrics);
  const pruned = await pruneKeywordMetrics(90);
  log('info', `sync-keywords: saved ${saved} query metrics and pruned ${pruned} expired rows in Supabase`);
  return saved;
}

async function runFetch(mode) {
  log('info', `orchestrator: fetch-${mode}`);
  if (DRY_RUN) {
    log('info', `DRY RUN: would run node pipeline/scripts/exa-fetch.mjs ${mode}`);
    return true;
  }
  try {
    execSync(`node pipeline/scripts/exa-fetch.mjs ${mode}`, { cwd: ROOT, stdio: 'pipe' });
    log('info', `fetch-${mode}: completed`);
    return true;
  } catch (e) {
    log('error', `fetch-${mode}: ${e.message}`);
    return false;
  }
}

// ── Stage: Write News ──────────────────────────────────────────
async function runWriteNews() {
  log('info', 'orchestrator: write-news');
  const today = new Date().toISOString().slice(0, 10);

  const todayCount = countToday('news') + countToday('legal');
  if (todayCount >= CONFIG.velocity.maxNewsPerDay) {
    log('info', `write-news: velocity cap reached (${todayCount}/${CONFIG.velocity.maxNewsPerDay})`);
    return 0;
  }

  const exaDir = join(PIPELINE, 'data', 'exa', 'news');
  const exaFiles = listFiles(exaDir, /\.json$/).sort();
  if (exaFiles.length === 0) {
    log('info', 'write-news: no exa data available');
    return 0;
  }

  const latestFile = exaFiles[exaFiles.length - 1];
  const exaData = readJson(latestFile);
  if (!exaData || !exaData.sets) {
    log('warn', 'write-news: invalid exa data');
    return 0;
  }

  const processedPath = join(PIPELINE, 'data', '.processed-news.json');
  const processed = readJson(processedPath, { files: [] });
  const fileName = basename(latestFile);
  if (processed.files.includes(fileName)) {
    log('info', `write-news: already processed ${fileName}`);
    return 0;
  }

  const available = Math.max(0, CONFIG.velocity.maxNewsPerDay - todayCount);
  if (available === 0) {
    log('info', 'write-news: no slots available');
    return 0;
  }

  const candidateStories = exaData.sets.flatMap((s) => s.results || []);
  if (candidateStories.length === 0) {
    log('info', 'write-news: no stories in exa data');
    return 0;
  }

  const allStories = [];
  for (const story of candidateStories) {
    if (!story.url || !isAuthoritativeUrl(story.url)) continue;
    try {
      const primaryText = await webFetch(story.url, { maxRetries: 1, timeout: 12000 });
      allStories.push({ ...story, primaryText: readableText(primaryText).slice(0, 6000) });
    } catch (e) {
      log('warn', `write-news: primary source unavailable ${story.url}: ${e.message}`);
    }
    if (allStories.length >= 12) break;
  }
  if (allStories.length === 0) {
    log('warn', 'write-news: no reachable authoritative primary sources; refusing to draft');
    processed.files.push(fileName);
    writeJson(processedPath, processed);
    return 0;
  }

  const existingTitles = [...allTitles('news'), ...allTitles('legal')];
  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-news.md')) || '';
  const samplePost = readText(join(ROOT, 'sites', 'news', 'src', 'content', 'news', '_sample-fda-reclassification.md')) || '';

  const systemPrompt = `You are an autonomous peptide news writer. You MUST follow every editorial rule below.\n\n${claudeRules}\n\n${writerPrompt}\n\nSAMPLE FORMAT:\n${samplePost}`;

  const userPrompt = `Today's date: ${today}
News posts already published today: ${todayCount}
Maximum allowed today: ${CONFIG.velocity.maxNewsPerDay}
You may write up to: ${available} posts

EXISTING POSTS (do not duplicate these topics):
${existingTitles.map((t) => `- ${t}`).join('\n') || '(none yet)'}

EXA NEWS RESULTS (fetched at ${exaData.fetchedAt}):
${JSON.stringify(
    allStories.map((r) => ({
      title: r.title,
      url: r.url,
      text: r.primaryText,
      publishedDate: r.publishedDate,
    })),
    null,
    2
  )}

INSTRUCTIONS:
1. Select up to ${available} most substantive stories from the Exa results above
2. For each story, write a markdown post with YAML frontmatter matching this schema. Output RAW markdown — do NOT wrap in \`\`\`markdown code blocks:
   ---
   title: "..."
   description: "..."
   sourceName: "..."
   sourceUrl: "..."
   sourceType: primary
   author: "Peptide Atlas Editorial Team"
   tags: ["tag1", "tag2"]
   publishDate: YYYY-MM-DD
   ---
3. Separate each post with: <!-- POST SEPARATOR -->
4. 400-700 words per post
5. Report, never advise. No treatment claims.
6. Every claim attributed to a named source.
7. If a story is primarily about laws/regulation, use the legal schema instead:
   ---
   title: "..."
   description: "..."
   jurisdiction: "Federal"
   sourceName: "..."
   sourceUrl: "..."
   sourceType: primary
   author: "Peptide Atlas Editorial Team"
   tags: ["tag1", "tag2"]
   publishDate: YYYY-MM-DD
   ---`;

  if (DRY_RUN) {
    log('info', 'DRY RUN: would call OpenAI to write news posts');
    return 0;
  }

  try {
    const response = await chat({
      system: systemPrompt,
      user: userPrompt,
      model: CONFIG.models.writing,
      temperature: 0.6,
    });

    const posts = response
      .split('<!-- POST SEPARATOR -->')
      .map((s) => s.trim())
      .filter(Boolean);
    let written = 0;

    for (const post of posts) {
      const fm = parseFrontmatter(post);
      if (!fm || !fm.data.title) {
        // Debug: log what went wrong so we can fix the parser or prompt
        const preview = post.slice(0, 200).replace(/\n/g, '\\n');
        const hasSeparator = post.includes('---');
        log('warn', `write-news: skipping malformed post (has '---': ${hasSeparator}, preview: ${preview}...)`);
        // Save it for manual inspection
        const debugPath = join(PIPELINE, 'drafts', 'news', `_malformed-${Date.now()}.md`);
        writeText(debugPath, post);
        continue;
      }

      const collection = fm.data.jurisdiction ? 'legal' : 'news';
      const slug = `${today}-${slugify(fm.data.title)}`;
      const outPath = join(PIPELINE, 'drafts', collection, `${slug}.md`);
      const imagePath = await generateImage(collection, {
        title: fm.data.title,
        description: fm.data.description,
        tags: fm.data.tags || [],
      }, slug);

      let postWithImage = post;
      if (imagePath) {
        postWithImage = post.replace(
          /^(---\n[\s\S]*?publishDate:\s*\d{4}-\d{2}-\d{2}\n)/m,
          `$1image: "${imagePath}"\n`
        );
      }

      writeText(outPath, postWithImage);
      log('info', `write-news: drafted ${slug}${imagePath ? ' with image' : ''}`);
      written++;
    }

    processed.files.push(fileName);
    writeJson(processedPath, processed);
    return written;
  } catch (e) {
    log('error', `write-news: ${e.message}`);
    return 0;
  }
}

// ── Stage: Write Blog ──────────────────────────────────────────
async function runWriteBlog() {
  log('info', 'orchestrator: write-blog');
  const today = new Date().toISOString().slice(0, 10);

  const todayCount = countToday('blog');
  if (todayCount >= CONFIG.velocity.maxBlogPerDay) {
    log('info', `write-blog: velocity cap reached (${todayCount}/${CONFIG.velocity.maxBlogPerDay})`);
    return 0;
  }

  const available = Math.max(0, CONFIG.velocity.maxBlogPerDay - todayCount);
  if (available === 0) {
    log('info', 'write-blog: no slots available');
    return 0;
  }

  const existingTitles = allTitles('blog');
  const existingNewsTitles = [...allTitles('news'), ...allTitles('legal')];
  const topicQueue = readJson(join(PIPELINE, 'queue', 'blog-topics.json'), { topics: [] });
  const existingBlogFiles = [
    ...findFiles(contentDirFor('blog'), /\.md$/, /_sample|\.diff\.md/),
    ...findFiles(join(PIPELINE, 'drafts', 'blog'), /\.md$/, /_sample|\.diff\.md/),
    ...findFiles(join(PIPELINE, 'humanised', 'blog'), /\.md$/, /_sample|\.diff\.md/),
  ];
  const existingSlugs = new Set(existingBlogFiles.map((path) => basename(path, '.md')));
  const existingNormalizedTitles = new Set(existingBlogFiles
    .map((path) => extractTitle(readText(path) || ''))
    .filter(Boolean)
    .map((title) => slugify(title)));
  const keywordSignals = DRY_RUN ? [] : await getKeywordSignals();
  const selectedTopics = (topicQueue.topics || [])
    .filter((topic) => topic.status === 'ready')
    .filter((topic) => topic.id && topic.title && topic.keyword && topic.category)
    .filter((topic) => !existingSlugs.has(topic.id) && !existingNormalizedTitles.has(slugify(topic.title)))
    .map((topic) => ({ ...topic, searchOpportunity: keywordOpportunityScore(topic, keywordSignals) }))
    .sort((a, b) => b.searchOpportunity - a.searchOpportunity || (b.priority || 0) - (a.priority || 0))
    .slice(0, available);

  if (selectedTopics.length === 0) {
    log('warn', 'write-blog: no ready, unpublished topics remain in blog-topics.json');
    return 0;
  }

  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-blog.md')) || '';
  const samplePost = readText(join(ROOT, 'sites', 'content', 'src', 'content', 'blog', '_sample-beginners-guide.md')) || '';

  const systemPrompt = `You are an autonomous peptide blog writer. You MUST follow every editorial rule below.\n\n${claudeRules}\n\n${writerPrompt}\n\nSAMPLE FORMAT:\n${samplePost}`;

  if (DRY_RUN) {
    for (const topic of selectedTopics) {
      log('info', `DRY RUN: would write blog topic ${topic.id} for keyword "${topic.keyword}"`);
    }
    return 0;
  }

  let written = 0;
  for (const topic of selectedTopics) {
    const researchBundle = [];
    for (const url of topic.sourceUrls || []) {
      if (!isAuthoritativeUrl(url)) {
        log('warn', `write-blog: ignored non-authoritative queued source ${url}`);
        continue;
      }
      try {
        const sourceText = await webFetch(url, { maxRetries: 1, timeout: 12000 });
        researchBundle.push({ url, text: readableText(sourceText).slice(0, 6000) });
      } catch (e) {
        log('warn', `write-blog: research source unavailable ${url}: ${e.message}`);
      }
    }
    if (researchBundle.length < 2) {
      log('warn', `write-blog: ${topic.id} has fewer than two reachable authoritative sources; refusing to draft`);
      continue;
    }

    const approvedSources = researchBundle.map((source) => source.url);
    const userPrompt = `Today's date: ${today}

ASSIGNED EDITORIAL BRIEF:
- Exact title: ${topic.title}
- Primary keyword: ${topic.keyword}
- Supporting phrases: ${(topic.supportingKeywords || []).join(', ') || '(none)'}
- Category: ${topic.category}
- Reader intent: ${topic.intent}

EXISTING BLOG POSTS (do not duplicate these topics):
${existingTitles.map((title) => `- ${title}`).join('\n') || '(none yet)'}

RECENT NEWS TOPICS (keep this article evergreen and avoid duplicating them):
${existingNewsTitles.slice(0, 20).map((title) => `- ${title}`).join('\n') || '(none yet)'}

APPROVED AUTHORITATIVE SOURCES:
${JSON.stringify(researchBundle, null, 2)}

INSTRUCTIONS:
1. Write one evergreen educational article that follows the assigned brief. Do not choose a different topic or title.
2. Use the primary keyword naturally. Do not repeat it mechanically or write for a search engine instead of a reader.
3. Use only the approved source URLs in frontmatter and factual attribution. Do not invent citations.
4. Output raw Markdown beginning with this schema, without a code fence:
   ---
   title: "${topic.title}"
   description: "..."
   category: "${topic.category}"
   tags: ["tag1", "tag2"]
   sources: ${JSON.stringify(approvedSources)}
   author: "Peptide Atlas Editorial Team"
   publishDate: ${today}
   ---
5. Write 1,000-1,500 words. Attribute every medical or regulatory claim to a named source.
6. Report evidence and uncertainty. Do not recommend a treatment, product, dose, clinic, or clinician.
7. Add relevant cross-domain links only when they help the reader.`;

    try {
      const response = await chat({
        system: systemPrompt,
        user: userPrompt,
        model: CONFIG.models.writing,
        temperature: 0.65,
      });
      const generatedPost = stripMarkdownFences(response);
      const fm = parseFrontmatter(generatedPost);
      if (!fm || !fm.data.title) {
        const preview = generatedPost.slice(0, 200).replace(/\n/g, '\\n');
        log('warn', `write-blog: skipping malformed ${topic.id} (preview: ${preview}...)`);
        const debugPath = join(PIPELINE, 'drafts', 'blog', `_malformed-${topic.id}-${Date.now()}.md`);
        writeText(debugPath, generatedPost);
        continue;
      }
      const post = canonicalBlogPost({ parsed: fm, topic, approvedSources, today });
      if (!post) {
        log('warn', `write-blog: ${topic.id} returned an empty body or description`);
        continue;
      }
      if (slugify(fm.data.title) !== slugify(topic.title) || fm.data.category !== topic.category) {
        log('info', `write-blog: corrected generated frontmatter to the assigned brief for ${topic.id}`);
      }
      const outPath = join(PIPELINE, 'drafts', 'blog', `${topic.id}.md`);

      const imagePath = await generateImage('blog', {
        title: topic.title,
        description: fm.data.description,
      }, topic.id);

      let postWithImage = post;
      if (imagePath) {
        postWithImage = post.replace(
          /^(---\n[\s\S]*?publishDate:\s*\d{4}-\d{2}-\d{2}\n)/m,
          `$1image: "${imagePath}"\n`
        );
      }

      writeText(outPath, postWithImage);
      log('info', `write-blog: drafted ${topic.id} for keyword "${topic.keyword}" (Search Console opportunity ${topic.searchOpportunity.toFixed(1)})${imagePath ? ' with image' : ''}`);
      written++;
    } catch (e) {
      log('error', `write-blog: ${topic.id}: ${e.message}`);
    }
  }
  return written;
}

// ── Stage: Humanise ────────────────────────────────────────────
async function runHumanise() {
  log('info', 'orchestrator: humanise');
  const draftsDir = join(PIPELINE, 'drafts');
  const humanisedDir = join(PIPELINE, 'humanised');

  const draftFiles = findFiles(draftsDir, /\.md$/, /\.diff\.md/);
  if (draftFiles.length === 0) {
    log('info', 'humanise: no drafts');
    return 0;
  }

  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const humanisePrompt = readText(join(PIPELINE, 'prompts', 'humanise.md')) || '';

  const rubricMatch = claudeRules.match(/## Humaniser (?:rubric|limits)[\s\S]*?(?=## Velocity|$)/);
  const rubric = rubricMatch ? rubricMatch[0] : 'Remove AI-writing signs: puffery, essay scaffolding, hedging, vague attribution, uniform rhythm.';

  let processed = 0;
  const maxFiles = CONFIG.velocity.maxHumanisePerRun;

  for (const draftPath of draftFiles.slice(0, maxFiles)) {
    const draftText = readText(draftPath);
    if (!draftText) continue;

    const systemPrompt = `You are an editor who removes AI-writing signs from draft articles.\n\n${rubric}\n\n${humanisePrompt}\n\nCRITICAL RULES:\n- Never change facts, names, numbers, ratings, platform attributions, URLs, or frontmatter\n- Never change the methodology paragraph's substance\n- Only change style and wording\n- Keep all YAML frontmatter exactly as-is\n- OUTPUT the raw article text only. Do NOT wrap the output in Markdown code fences (no \`\`\`markdown blocks). The file must start with --- (the YAML frontmatter delimiter).`;

    const userPrompt = `Rewrite the following draft to remove all AI-writing signs. Keep the frontmatter unchanged. Keep all facts exactly as they are.\n\nOUTPUT the full rewritten article starting directly with the frontmatter (---). No code blocks, no markdown fences.\n\nDRAFT:\n${draftText}`;

    if (DRY_RUN) {
      log('info', `DRY RUN: would humanise ${basename(draftPath)}`);
      processed++;
      continue;
    }

    try {
      const response = await chat({
        system: systemPrompt,
        user: userPrompt,
        model: CONFIG.models.humanise,
        temperature: 0.5,
      });

      const relativePath = draftPath.replace(draftsDir, '').replace(/^[\\/]/, '');
      const outPath = join(humanisedDir, relativePath);
      const diffPath = outPath.replace(/\.md$/, '.diff.md');

      const original = stripMarkdownFences(draftText).replace(/\r\n/g, '\n');
      let edited = stripMarkdownFences(response).replace(/\r\n/g, '\n');
      const originalParts = original.match(/^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/);
      let editedParts = edited.match(/^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/);
      if (!originalParts || !editedParts) {
        log('warn', `humanise: rejected ${relativePath}; editor returned malformed frontmatter`);
        continue;
      }
      let cleanedResponse = `${originalParts[1]}${editedParts[2].trim()}\n`;
      const collection = relativePath.split(/[\\/]/)[0];
      let guard = validateContent({
        text: cleanedResponse,
        collection,
        filename: draftPath,
        verifiedRoot: join(PIPELINE, 'data', 'verified'),
      });
      if (!guard.ok) {
        log('info', `humanise: corrective pass for ${relativePath}: ${guard.errors.join('; ')}`);
        const correction = await chat({
          system: systemPrompt,
          user: `The edited draft failed deterministic publication checks. Fix every listed issue without adding facts or changing frontmatter.\n\nCHECK FAILURES:\n${guard.errors.map((error) => `- ${error}`).join('\n')}\n\nCURRENT EDITED DRAFT:\n${cleanedResponse}`,
          model: CONFIG.models.humanise,
          temperature: 0.25,
        });
        edited = stripMarkdownFences(correction).replace(/\r\n/g, '\n');
        editedParts = edited.match(/^(---\s*\n[\s\S]*?\n---\s*\n)([\s\S]*)$/);
        if (editedParts) {
          cleanedResponse = `${originalParts[1]}${editedParts[2].trim()}\n`;
          guard = validateContent({
            text: cleanedResponse,
            collection,
            filename: draftPath,
            verifiedRoot: join(PIPELINE, 'data', 'verified'),
          });
        }
      }
      if (!guard.ok) {
        log('warn', `humanise: rejected ${relativePath}: ${guard.errors.join('; ')}`);
        continue;
      }
      writeText(outPath, cleanedResponse);

      const diff = `<!-- BEFORE -->\n${draftText}\n\n<!-- AFTER -->\n${cleanedResponse}`;
      writeText(diffPath, diff);

      unlinkSync(draftPath);
      log('info', `humanise: processed ${relativePath}`);
      processed++;
    } catch (e) {
      log('error', `humanise: failed for ${draftPath}: ${e.message}`);
    }
  }

  return processed;
}

// ── Stage: Publish ─────────────────────────────────────────────
function pipelineStatePaths() {
  return [
    join(PIPELINE, 'data', 'verified'),
    join(PIPELINE, 'data', '.processed-news.json'),
    join(PIPELINE, 'data', '.processed-clinics.json'),
    join(PIPELINE, 'data', '.processed-doctors.json'),
    join(PIPELINE, 'queue', 'cities.json'),
    join(PIPELINE, 'queue', 'states.json'),
    join(PIPELINE, 'queue', 'keywords.json'),
  ];
}

function commitScopedChanges(extraPaths, message) {
  const preExistingStaged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (preExistingStaged) throw new Error('Refusing to mix pipeline output with pre-existing staged changes');
  const stagePaths = [...extraPaths, ...pipelineStatePaths()]
    .filter((path) => path && existsSync(path))
    .map((path) => relative(ROOT, path));
  execFileSync('git', ['add', '--', ...stagePaths], { cwd: ROOT, stdio: 'pipe' });
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!staged) return false;
  execFileSync('git', ['commit', '-m', message], { cwd: ROOT, stdio: 'pipe' });
  return true;
}

async function runPublish() {
  log('info', 'orchestrator: publish');
  const humanisedDir = join(PIPELINE, 'humanised');
  const files = findFiles(humanisedDir, /\.md$/, /\.diff\.md/);
  if (files.length === 0) {
    log('info', 'publish: nothing to publish');
    if (!DRY_RUN) {
      await advanceQueues();
      if (commitScopedChanges([], `pipeline: checkpoint ${new Date().toISOString().slice(0, 10)}`)) {
        log('info', 'publish: committed verification and queue checkpoint');
      }
    }
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10);

  const todayDirCount = countToday('clinics') + countToday('doctors');
  const todayNewsCount = countToday('news') + countToday('legal');
  const todayBlogCount = countToday('blog');
  let selectedDir = 0;
  let selectedNews = 0;
  let selectedBlog = 0;

  const toMove = [];

  for (const file of files) {
    const text = readText(file);
    if (!text) continue;

    const fm = parseFrontmatter(text);
    if (!fm || !fm.data.title) {
      const preview = text.slice(0, 200).replace(/\n/g, '\\n');
      log('warn', `publish: skipping malformed ${basename(file)} (preview: ${preview}...)`);
      continue;
    }

    const relativePath = file.replace(humanisedDir, '').replace(/^[\\/]/, '');
    const collection = relativePath.split(/[\\/]/)[0];
    if (!collection) {
      log('warn', `publish: cannot determine collection for ${basename(file)}`);
      continue;
    }

    const isDir = collection === 'clinics' || collection === 'doctors';
    const isNews = collection === 'news' || collection === 'legal';
    const isBlog = collection === 'blog';

    const guard = validateContent({
      text,
      collection,
      filename: file,
      verifiedRoot: join(PIPELINE, 'data', 'verified'),
    });
    if (!guard.ok) {
      log('warn', `publish: blocked ${basename(file)}: ${guard.errors.join('; ')}`);
      continue;
    }

    if (isDir && todayDirCount + selectedDir >= CONFIG.velocity.maxDirPerDay) {
      log('info', `publish: directory cap reached (${todayDirCount + selectedDir}/${CONFIG.velocity.maxDirPerDay})`);
      continue;
    }
    if (isNews && todayNewsCount + selectedNews >= CONFIG.velocity.maxNewsPerDay) {
      log('info', `publish: news cap reached (${todayNewsCount + selectedNews}/${CONFIG.velocity.maxNewsPerDay})`);
      continue;
    }
    if (isBlog && todayBlogCount + selectedBlog >= CONFIG.velocity.maxBlogPerDay) {
      log('info', `publish: blog cap reached (${todayBlogCount + selectedBlog}/${CONFIG.velocity.maxBlogPerDay})`);
      continue;
    }

    const collectionTitles = allTitles(collection);
    if (collectionTitles.includes(fm.data.title)) {
      log('warn', `publish: duplicate title "${fm.data.title}" in ${collection}, removing`);
      unlinkSync(file);
      const diffFile = file.replace(/\.md$/, '.diff.md');
      if (existsSync(diffFile)) unlinkSync(diffFile);
      continue;
    }

    const targetDir = contentDirFor(collection);
    const targetPath = join(targetDir, basename(file));
    if (existsSync(targetPath)) {
      log('warn', `publish: already exists ${basename(file)}, removing from humanised`);
      unlinkSync(file);
      const diffFile = file.replace(/\.md$/, '.diff.md');
      if (existsSync(diffFile)) unlinkSync(diffFile);
      continue;
    }

    const imageFile = typeof fm.data.image === 'string' && /^\/images\/[A-Za-z0-9_./-]+$/.test(fm.data.image)
      ? join(siteDirFor(collection), 'public', fm.data.image.replace(/^\//, ''))
      : null;
    toMove.push({
      file, targetPath, imageFile, collection, title: fm.data.title,
      frontmatter: fm.data, isDir, isNews, isBlog,
    });
    if (isDir) selectedDir++;
    if (isNews) selectedNews++;
    if (isBlog) selectedBlog++;
  }

  if (DRY_RUN) {
    if (toMove.length > 0) {
      log('info', `DRY RUN: would publish ${toMove.length} posts:`);
      for (const item of toMove) {
        log('info', `  - ${item.title} → ${item.collection}`);
      }
    }
    return toMove.length;
  }

  if (toMove.length === 0) {
    log('info', 'publish: no files passed validation');
    await advanceQueues();
    if (commitScopedChanges([], `pipeline: checkpoint ${today}`)) {
      log('info', 'publish: committed verification and queue checkpoint');
    }
    return 0;
  }

  for (const item of toMove) {
    mkdirSync(dirname(item.targetPath), { recursive: true });
    renameSync(item.file, item.targetPath);
    log('info', `publish: moved ${item.title} → ${item.collection}`);
    const diffFile = item.file.replace(/\.md$/, '.diff.md');
    if (existsSync(diffFile)) unlinkSync(diffFile);
  }

  // Build all sites that received content
  const sitesToBuild = new Set();
  for (const item of toMove) {
    sitesToBuild.add(siteDirFor(item.collection));
  }

  for (const siteDir of sitesToBuild) {
    log('info', `publish: building ${siteDir.replace(ROOT, '').replace(/\\/g, '/')}...`);
    try {
      execSync('npm run build', { cwd: siteDir, stdio: 'pipe' });
      log('info', `publish: build successful for ${siteDir.replace(ROOT, '').replace(/\\/g, '/')}`);
    } catch (e) {
      log('error', `publish: build failed: ${e.message}`);
      for (const item of toMove) {
        if (existsSync(item.targetPath)) {
          renameSync(item.targetPath, item.file);
          log('info', `publish: reverted ${item.title}`);
        }
      }
      return 0;
    }
  }

  await advanceQueues();
  log('info', 'publish: committing scoped publication files');
  try {
    const publicationPaths = toMove.flatMap((item) => [item.targetPath, item.imageFile].filter((path) => path && existsSync(path)));
    if (!commitScopedChanges(publicationPaths, `publish: auto-posts ${today}`)) {
      throw new Error('No scoped publication changes were staged');
    }
    const topicQueue = readJson(join(PIPELINE, 'queue', 'blog-topics.json'), { topics: [] });
    for (const item of toMove) {
      const slug = basename(item.targetPath, '.md');
      const domain = item.collection === 'clinics' ? 'https://mypeptide.club'
        : item.collection === 'doctors' ? 'https://toppeptideslist.com'
          : item.collection === 'news' ? 'https://peptidesnews.us'
            : item.collection === 'updates' ? 'https://peptidesupdates.com'
              : 'https://safepeptides.us';
      const route = item.collection === 'doctors' || item.collection === 'news' || item.collection === 'updates'
        ? `/${slug}/`
        : `/${item.collection}/${slug}/`;
      const topic = item.collection === 'blog'
        ? (topicQueue.topics || []).find((candidate) => candidate.id === slug)
        : null;
      await upsertPublishedPost({
        title: item.frontmatter.title,
        slug,
        description: item.frontmatter.description,
        collection: item.collection,
        source_name: item.frontmatter.sourceName || null,
        source_url: item.frontmatter.sourceUrl || item.frontmatter.sources?.[0] || null,
        site_url: `${domain}${route}`,
        publish_date: item.frontmatter.publishDate || today,
        published: true,
        published_at: new Date().toISOString(),
        featured_image: item.frontmatter.image || null,
        og_image: item.frontmatter.ogImage || null,
        tags: item.frontmatter.tags || [],
        keywords: topic ? [topic.keyword, ...(topic.supportingKeywords || [])] : [],
      });
    }
    if (process.env.AUTO_PUSH === 'true') {
      let pushed = false;
      for (let attempt = 1; attempt <= 2 && !pushed; attempt++) {
        try {
          execSync('git push', { cwd: ROOT, stdio: 'pipe' });
          pushed = true;
          log('info', 'publish: pushed to remote; Vercel deployment triggered');
        } catch (pushError) {
          log('warn', `publish: push attempt ${attempt}/2 failed: ${pushError.message}`);
        }
      }
      if (!pushed) throw new Error('Automatic push failed twice; the local publication commit was retained');
    } else {
      log('info', 'publish: committed locally. Set AUTO_PUSH=true to deploy automatically.');
    }
  } catch (e) {
    log('error', `publish: git commit or push failed: ${e.message}`);
    throw e;
  }

  return toMove.length;
}

// ── Queue advancement ──────────────────────────────────────────
async function advanceQueues() {
  // Advance cities queue
  const citiesPath = join(PIPELINE, 'queue', 'cities.json');
  const cities = readJson(citiesPath);
  if (cities && cities.inFlight) {
    const inFlightCity = cities.inFlight.label; // e.g. "Miami, FL"
    const [inFlightCityName, inFlightState] = inFlightCity.split(', ').map((s) => s.trim());

    // Check if any verified/draft/humanised records for this city remain unpublished
    const cityLower = inFlightCityName.toLowerCase();
    const stateLower = inFlightState.toLowerCase();

    const publishedSlugs = new Set(
      findFiles(contentDirFor('clinics'), /\.md$/)
        .map((p) => basename(p, '.md').toLowerCase())
    );

    const verifiedFiles = listFiles(join(PIPELINE, 'data', 'verified', 'clinics'), /\.json$/)
      .filter((p) => basename(p).toLowerCase().startsWith(`${cityLower}-${stateLower}-`));
    const hasUnpublishedVerified = verifiedFiles.some((p) => !publishedSlugs.has(basename(p, '.json').toLowerCase()));

    const hasRemainingDrafts = existsSync(join(PIPELINE, 'drafts', 'clinics')) &&
      listFiles(join(PIPELINE, 'drafts', 'clinics'), /\.md$/)
        .some((p) => basename(p).toLowerCase().startsWith(`${cityLower}-${stateLower}-`));
    const hasRemainingHumanised = existsSync(join(PIPELINE, 'humanised', 'clinics')) &&
      listFiles(join(PIPELINE, 'humanised', 'clinics'), /\.md$/)
        .some((p) => basename(p).toLowerCase().startsWith(`${cityLower}-${stateLower}-`));

    if (!hasUnpublishedVerified && !hasRemainingDrafts && !hasRemainingHumanised) {
      cities.next += 1;
      delete cities.inFlight;
      writeJson(citiesPath, cities);
      log('info', `publish: advanced cities queue past ${inFlightCity} (next=${cities.next})`);
    } else {
      log('info', `publish: cities queue holding — ${inFlightCity} still has unpublished content (unpublished-verified:${hasUnpublishedVerified}, drafts:${hasRemainingDrafts}, humanised:${hasRemainingHumanised})`);
    }
  }

  // Advance states queue
  const statesPath = join(PIPELINE, 'queue', 'states.json');
  const states = readJson(statesPath);
  if (states && states.inFlight) {
    const inFlightLabel = states.inFlight.label; // e.g. "Florida/GLP-1 therapy"
    const [inFlightState, inFlightSpecialty] = inFlightLabel.split('/').map((s) => s.trim());

    const stateCode = inFlightState.length === 2 ? inFlightState.toLowerCase() : stateNameToCode(inFlightState)?.toLowerCase() || '';

    const publishedDoctorSlugs = new Set(
      findFiles(contentDirFor('doctors'), /\.md$/)
        .map((p) => basename(p, '.md').toLowerCase())
    );

    const verifiedDoctorFiles = listFiles(join(PIPELINE, 'data', 'verified', 'doctors'), /\.json$/)
      .filter((p) => basename(p).toLowerCase().startsWith(`${stateCode}-`));
    const hasUnpublishedVerified = verifiedDoctorFiles.some((p) => !publishedDoctorSlugs.has(basename(p, '.json').toLowerCase()));

    const hasRemainingDrafts = existsSync(join(PIPELINE, 'drafts', 'doctors')) &&
      listFiles(join(PIPELINE, 'drafts', 'doctors'), /\.md$/)
        .some((p) => basename(p).toLowerCase().startsWith(`${stateCode}-`));
    const hasRemainingHumanised = existsSync(join(PIPELINE, 'humanised', 'doctors')) &&
      listFiles(join(PIPELINE, 'humanised', 'doctors'), /\.md$/)
        .some((p) => basename(p).toLowerCase().startsWith(`${stateCode}-`));

    if (!hasUnpublishedVerified && !hasRemainingDrafts && !hasRemainingHumanised) {
      states.next += 1;
      delete states.inFlight;
      writeJson(statesPath, states);
      log('info', `publish: advanced states queue past ${inFlightLabel} (next=${states.next})`);
    } else {
      log('info', `publish: states queue holding — ${inFlightLabel} still has unpublished content`);
    }
  }
  if (cities) {
    await setQueueState('cities', {
      next_index: cities.next || 0,
      in_flight_label: cities.inFlight?.label || null,
      in_flight_file: cities.inFlight?.file || null,
      in_flight_at: cities.inFlight?.fetchedAt || null,
      total_processed: cities.next || 0,
    });
  }
  if (states) {
    await setQueueState('states', {
      next_index: states.next || 0,
      in_flight_label: states.inFlight?.label || null,
      in_flight_file: states.inFlight?.file || null,
      in_flight_at: states.inFlight?.fetchedAt || null,
      total_processed: states.next || 0,
    });
  }
}

/** Convert full state name to two-letter code (common ones). */
function stateNameToCode(name) {
  const map = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
    montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
    'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
    ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
    utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
    wisconsin: 'WI', wyoming: 'WY',
  };
  return map[name.toLowerCase().trim()] || name;
}

// ── Stage: Monitor ─────────────────────────────────────────────
async function runMonitor() {
  log('info', 'orchestrator: monitor');

  // Write daily summary
  const summaryPath = join(PIPELINE, 'logs', 'daily-summary.md');
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(PIPELINE, 'logs', `${today}.log`);
  const rawLogLines = (readText(logPath) || 'No logs today.').split(/\r?\n/).filter(Boolean);
  const warningLines = rawLogLines.filter((line) => /\[(warn|error)\]/i.test(line));
  const logs = rawLogLines.slice(-80).join('\n');

  // Count published posts today
  const todayNews = countToday('news') + countToday('legal');
  const todayBlog = countToday('blog');
  const todayClinics = countToday('clinics');
  const todayDoctors = countToday('doctors');

  const reverify = [];
  const cutoff = Date.now() - 90 * 86_400_000;
  for (const collection of ['clinics', 'doctors']) {
    for (const file of findFiles(contentDirFor(collection), /\.md$/, /_sample/)) {
      const text = readText(file) || '';
      const date = text.match(/updatedDate:\s*(\d{4}-\d{2}-\d{2})/)?.[1] || extractDate(text);
      if (date && new Date(`${date}T00:00:00Z`).getTime() < cutoff) {
        reverify.push({ collection, slug: basename(file, '.md'), lastVerified: date });
      }
    }
  }
  if (!DRY_RUN) writeJson(join(PIPELINE, 'queue', 'reverify.json'), { generatedAt: new Date().toISOString(), items: reverify });

  let weeklyStatus = '';
  if (new Date().getDay() === 0) {
    const cities = readJson(join(PIPELINE, 'queue', 'cities.json'), { cities: [], next: 0 });
    const states = readJson(join(PIPELINE, 'queue', 'states.json'), { states: [], next: 0 });
    weeklyStatus = `\n### Weekly check\n- Cities remaining: ${Math.max(0, (cities.cities?.length || 0) - (cities.next || 0))}\n- Doctor queue items remaining: ${Math.max(0, (states.states?.length || 0) - (states.next || 0))}\n`;
  }

  const summary = `## Daily Summary — ${today}

### Attention required
${warningLines.length ? warningLines.slice(-20).map((line) => `- ${line}`).join('\n') : '- No warnings or errors recorded today.'}

### Pipeline Activity
${logs}

### Published Today
- News + Legal: ${todayNews}
- Blog: ${todayBlog}
- Clinics: ${todayClinics}
- Doctors: ${todayDoctors}

### Status
- Site: ${SITE_DOMAIN}
- Re-verification queue: ${reverify.length}
${weeklyStatus}

---

`;
  if (!DRY_RUN) writeText(summaryPath, summary.split(/\r?\n/).slice(0, 200).join('\n') + '\n');
  log('info', 'monitor: summary written');
}

// ── Stage: Verify ───────────────────────────────────────────────
async function runVerify() {
  log('info', 'orchestrator: verify');
  let totalVerified = 0;

  // ── Verify clinics ────────────────────────────────────────────
  const clinicExaDir = join(PIPELINE, 'data', 'exa', 'clinics');
  const clinicExaFiles = listFiles(clinicExaDir, /\.json$/).sort();
  const clinicProcessedPath = join(PIPELINE, 'data', '.processed-clinics.json');
  const clinicProcessed = readJson(clinicProcessedPath, { files: [] });

  for (const file of clinicExaFiles) {
    const fileName = basename(file);
    if (clinicProcessed.files.includes(fileName)) {
      log('info', `verify: skipping already processed clinic ${fileName}`);
      continue;
    }

    const data = readJson(file);
    if (!data || !data.results || data.results.length === 0) {
      if (!DRY_RUN) {
        clinicProcessed.files.push(fileName);
        writeJson(clinicProcessedPath, clinicProcessed);
      }
      continue;
    }

    const city = data.city || {};
    log('info', `verify: processing clinics ${city.city || ''}, ${city.state || ''} (${data.results.length} results)`);

    if (DRY_RUN) {
      log('info', `DRY RUN: would extract clinics from ${fileName}`);
      continue;
    }

    const { verified, rejected } = await verifyExaBatch(data, 'clinic', city);
    totalVerified += verified;

    clinicProcessed.files.push(fileName);
    writeJson(clinicProcessedPath, clinicProcessed);
    log('info', `verify: ${verified} verified, ${rejected} rejected clinics from ${fileName}`);
  }

  // ── Verify doctors ────────────────────────────────────────────
  const doctorExaDir = join(PIPELINE, 'data', 'exa', 'doctors');
  const doctorExaFiles = listFiles(doctorExaDir, /\.json$/).sort();
  const doctorProcessedPath = join(PIPELINE, 'data', '.processed-doctors.json');
  const doctorProcessed = readJson(doctorProcessedPath, { files: [] });

  for (const file of doctorExaFiles) {
    const fileName = basename(file);
    if (doctorProcessed.files.includes(fileName)) {
      log('info', `verify: skipping already processed doctor ${fileName}`);
      continue;
    }

    const data = readJson(file);
    if (!data || !data.results || data.results.length === 0) {
      if (!DRY_RUN) {
        doctorProcessed.files.push(fileName);
        writeJson(doctorProcessedPath, doctorProcessed);
      }
      continue;
    }

    const item = data.item || {};
    log('info', `verify: processing doctors ${item.state || ''}/${item.specialty || ''} (${data.results.length} results)`);

    if (DRY_RUN) {
      log('info', `DRY RUN: would extract doctors from ${fileName}`);
      continue;
    }

    const { verified, rejected } = await verifyExaBatch(data, 'doctor', item);
    totalVerified += verified;

    doctorProcessed.files.push(fileName);
    writeJson(doctorProcessedPath, doctorProcessed);
    log('info', `verify: ${verified} verified, ${rejected} rejected doctors from ${fileName}`);
  }

  return totalVerified;
}

/**
 * Verify a single batch of Exa results.
 * @param {object} data — Exa fetch result
 * @param {string} type — 'clinic' | 'doctor'
 * @param {object} context — city object for clinics, item object for doctors
 * @returns {object} { verified, rejected }
 */
async function verifyExaBatch(data, type, context) {
  let verified = 0;
  let rejected = 0;

  const extractionPrompt = type === 'clinic'
    ? `Extract peptide therapy clinics from the following web search results for ${context.city || ''}, ${context.state || ''}.

For each clinic, extract ONLY what is explicitly stated:
- clinicName, city, state, address, phone, website, doctorName
- services: list of peptide-related services
- ratingValue, ratingCount, ratingSource (only if platform named)
- sourceUrl
Skip blog posts, news articles, vendor sites. Reject "research chemical" vendors.
Output JSON: { "candidates": [ {...} ], "rejected": [ { "reason": "...", "sourceUrl": "..." } ] }

EXA RESULTS:
${JSON.stringify(data.results.map((r) => ({ title: r.title, url: r.url, text: (r.text || '').slice(0, 2000) })), null, 2)}`
    : `Extract peptide therapy physicians and doctors from the following web search results for ${context.state || ''}, specialty: ${context.specialty || ''}.

For each doctor, extract ONLY what is explicitly stated:
- doctorName (full name), city, state
- credentials (MD, DO, NP, etc. if mentioned)
- specialty (confirm matches ${context.specialty || ''} or related)
- clinicName, clinicWebsite, phone
- services: list of peptide-related services offered
- ratingValue, ratingCount, ratingSource (only if platform named)
- yearsInPractice (if stated)
- sourceUrl
Skip blog posts, news articles, vendor sites. Reject "research chemical" vendors.
Output JSON: { "candidates": [ {...} ], "rejected": [ { "reason": "...", "sourceUrl": "..." } ] }

EXA RESULTS:
${JSON.stringify(data.results.map((r) => ({ title: r.title, url: r.url, text: (r.text || '').slice(0, 2000) })), null, 2)}`;

  let candidates = [];
  let rejects = [];

  try {
    const response = await chat({
      system: `You extract structured ${type} data from web search results. Output ONLY valid JSON. Never invent data not present in the source.`,
      user: extractionPrompt,
      model: CONFIG.models.verify,
      temperature: 0.3,
      jsonMode: true,
    });
    const parsed = JSON.parse(response);
    candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    rejects = Array.isArray(parsed.rejected) ? parsed.rejected : [];
  } catch (e) {
    log('error', `verify: extraction failed: ${e.message}`);
    return { verified: 0, rejected: 0 };
  }

  // Verify each candidate
  for (const c of candidates) {
    const record = type === 'clinic'
      ? {
          clinicName: c.clinicName || '',
          city: c.city || context.city || '',
          state: c.state || context.state || '',
          address: c.address || '',
          phone: c.phone || '',
          website: normalizeHttpUrl(c.website) || '',
          doctorName: c.doctorName || '',
          services: Array.isArray(c.services) ? c.services : [],
          ratingValue: c.ratingValue || null,
          ratingCount: c.ratingCount || null,
          ratingSource: c.ratingSource || '',
          sourceUrls: [normalizeHttpUrl(c.sourceUrl), normalizeHttpUrl(c.website)].filter(Boolean),
          verified: false,
          verificationNotes: [],
        }
      : {
          doctorName: c.doctorName || '',
          city: c.city || '',
          state: c.state || context.state || '',
          credentials: c.credentials || '',
          specialty: c.specialty || context.specialty || '',
          clinicName: c.clinicName || '',
          website: normalizeHttpUrl(c.clinicWebsite || c.website) || '',
          phone: c.phone || '',
          services: Array.isArray(c.services) ? c.services : [],
          ratingValue: c.ratingValue || null,
          ratingCount: c.ratingCount || null,
          ratingSource: c.ratingSource || '',
          yearsInPractice: c.yearsInPractice || null,
          sourceUrls: [normalizeHttpUrl(c.sourceUrl), normalizeHttpUrl(c.clinicWebsite || c.website)].filter(Boolean),
          verified: false,
          verificationNotes: [],
        };

    const nameField = type === 'clinic' ? record.clinicName : record.doctorName;
    if (!nameField) {
      rejects.push({ reason: `Missing ${type} name`, sourceUrl: c.sourceUrl });
      continue;
    }

    // Website verification
    const sourceFallback = normalizeHttpUrl(c.sourceUrl);
    const fallbackHost = (() => {
      try { return new URL(sourceFallback).hostname.toLowerCase(); } catch { return ''; }
    })();
    const isDirectoryFallback = /(^|\.)(yelp|healthgrades|zocdoc|webmd|vitals|facebook|instagram|linkedin|mapquest)\./i.test(fallbackHost);
    const identityTokens = nameField.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !['clinic', 'health', 'wellness', 'medical', 'doctor'].includes(token));
    const fallbackMatchesIdentity = identityTokens.some((token) => fallbackHost.includes(token));
    const siteUrl = record.website || (!isDirectoryFallback && fallbackMatchesIdentity ? sourceFallback : '');
    let websiteConfirmed = false;
    if (siteUrl) {
      try {
        const siteText = await webFetch(siteUrl, { maxRetries: 1, timeout: 8000 });
        const pageText = readableText(siteText);
        const hasPeptide = /peptide|GLP-?1|semaglutide|tirzepatide/i.test(pageText);
        const hasIdentity = identityTokens.length === 0 || identityTokens.some((token) => pageText.toLowerCase().includes(token));
        if (!hasPeptide) record.verificationNotes.push('Website does not mention peptide-related services');
        else if (!hasIdentity) record.verificationNotes.push(`Website does not clearly identify the ${type}`);
        else {
          websiteConfirmed = true;
          record.website = siteUrl;
          record.sourceUrls = [...new Set([...record.sourceUrls, siteUrl])];
          record.verificationNotes.push('Website confirms peptide-related services');
        }
      } catch (e) {
        record.verificationNotes.push(`Website unreachable: ${e.message}`);
      }
    } else {
      record.verificationNotes.push('No website provided');
    }

    // NPI verification for named doctor
    const doctorToCheck = record.doctorName;
    let npiConfirmed = false;
    if (doctorToCheck) {
      const cleanName = doctorToCheck.replace(/\b(Dr|MD|DO|NP|PA|DVM|PhD)\.?\b/gi, '').trim();
      const nameParts = cleanName.split(/\s+/).filter((p) => p.length > 1);
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      if (firstName && lastName && record.state) {
        try {
          const stateCode = stateNameToCode(record.state).toUpperCase();
          const params = new URLSearchParams({
            version: '2.1',
            first_name: firstName,
            last_name: lastName,
            state: stateCode,
            limit: '10',
          });
          if (record.city) params.set('city', record.city);
          const npiRes = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params}`);
          if (!npiRes.ok) throw new Error(`HTTP ${npiRes.status}`);
          const npiData = await npiRes.json();
          const matches = (npiData.results ?? []).map((r) => ({
            npi: r.number,
            name: `${r.basic?.first_name ?? ''} ${r.basic?.last_name ?? ''}`.trim(),
            status: r.basic?.status ?? null,
            taxonomies: (r.taxonomies ?? []).map((t) => ({ desc: t.desc, state: t.state })),
            addresses: (r.addresses ?? []).map((a) => ({ city: a.city, state: a.state })),
          }));

          const selectedMatch = chooseSingleNpiMatch(matches, { state: stateCode, city: record.city });
          if (selectedMatch) {
            record.npi = selectedMatch.npi;
            record.taxonomies = selectedMatch.taxonomies;
            npiConfirmed = true;
            record.verificationNotes.push(`NPI verified: ${record.npi}`);
          } else if (matches.length > 1) {
            record.verificationNotes.push('NPI ambiguous — multiple matches');
            record.doctorName = '';
          } else {
            record.verificationNotes.push('NPI not found');
            record.doctorName = '';
          }
        } catch (e) {
          record.verificationNotes.push(`NPI check failed: ${e.message}`);
          record.doctorName = '';
        }
      }
    }

    // Decide: verified or rejected
    const hasWebsite = record.website && record.website.startsWith('http');
    const hasPeptideService = websiteConfirmed || record.services.some((s) => /peptide|GLP-?1|semaglutide|tirzepatide|hormone|longevity/i.test(s));
    const isVerifiable = type === 'doctor'
      ? Boolean(hasWebsite && websiteConfirmed && hasPeptideService && npiConfirmed && record.doctorName && record.npi)
      : Boolean(hasWebsite && websiteConfirmed && hasPeptideService);

    if (isVerifiable) {
      record.verified = true;
      const slug = type === 'clinic'
        ? `${record.city.toLowerCase().replace(/\s+/g, '-')}-${record.state.toLowerCase()}-${slugify(record.clinicName)}`
        : `${record.state.toLowerCase()}-${slugify(record.doctorName)}`;
      const outPath = join(PIPELINE, 'data', 'verified', type === 'clinic' ? 'clinics' : 'doctors', `${slug}.json`);
      writeJson(outPath, record);
      const verifiedAt = new Date().toISOString();
      if (type === 'clinic') {
        await upsertClinic({
          slug,
          clinic_name: record.clinicName,
          city: record.city,
          state: record.state,
          address: record.address || null,
          website: record.website || null,
          phone: record.phone || null,
          doctor_name: record.doctorName || null,
          npi: record.npi || null,
          services: record.services || [],
          rating_value: record.ratingValue || null,
          rating_count: record.ratingCount || null,
          rating_source: record.ratingSource || null,
          verified: true,
          verified_at: verifiedAt,
          verification_sources: record.sourceUrls || [],
          status: 'verified',
          notes: (record.verificationNotes || []).join('; '),
        });
      } else {
        await upsertDoctor({
          slug,
          kind: 'profile',
          doctor_name: record.doctorName,
          npi: record.npi,
          credentials: record.credentials || null,
          city: record.city || null,
          state: record.state,
          specialty: record.specialty,
          taxonomies: record.taxonomies || [],
          rating_value: record.ratingValue || null,
          rating_count: record.ratingCount || null,
          rating_source: record.ratingSource || null,
          verified: true,
          verified_at: verifiedAt,
          verification_sources: record.sourceUrls || [],
          status: 'verified',
          notes: (record.verificationNotes || []).join('; '),
        });
      }
      verified++;
    } else {
      rejects.push({ reason: `Not verifiable: ${record.verificationNotes.join('; ')}`, name: nameField });
    }
  }

  // Write rejected records
  for (const r of rejects) {
    const outPath = join(PIPELINE, 'data', 'rejected', `rejected-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
    writeJson(outPath, { ...r, context });
    rejected++;
  }

  return { verified, rejected };
}

// ── Stage: Write Clinics ───────────────────────────────────────
async function runWriteClinics() {
  log('info', 'orchestrator: write-clinics');
  const today = new Date().toISOString().slice(0, 10);

  const todayCount = countToday('clinics');
  if (todayCount >= CONFIG.velocity.maxDirPerDay) {
    log('info', `write-clinics: velocity cap reached (${todayCount}/${CONFIG.velocity.maxDirPerDay})`);
    return 0;
  }

  const verifiedDir = join(PIPELINE, 'data', 'verified', 'clinics');
  if (!existsSync(verifiedDir)) {
    log('info', 'write-clinics: no verified clinic data');
    return 0;
  }

  const verifiedFiles = listFiles(verifiedDir, /\.json$/);
  if (verifiedFiles.length === 0) {
    log('info', 'write-clinics: no verified clinics');
    return 0;
  }

  // Skip clinics that already have drafts or published posts
  const existingSlugs = new Set([
    ...findFiles(join(PIPELINE, 'drafts', 'clinics'), /\.md$/).map((p) => basename(p, '.md')),
    ...findFiles(join(PIPELINE, 'humanised', 'clinics'), /\.md$/).map((p) => basename(p, '.md')),
    ...findFiles(join(ROOT, 'site', 'src', 'content', 'clinics'), /\.md$/).map((p) => basename(p, '.md')),
  ]);

  const available = Math.max(0, CONFIG.velocity.maxDirPerDay - todayCount);
  let written = 0;

  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-clinics.md')) || '';
  const samplePost = readText(join(ROOT, 'site', 'src', 'content', 'clinics', '_sample-austin-tx-example-clinic.md')) || '';

  for (const vf of verifiedFiles.slice(0, available)) {
    const record = readJson(vf);
    if (!record || !record.verified) continue;

    const slug = `${record.city.toLowerCase().replace(/\s+/g, '-')}-${record.state.toLowerCase()}-${slugify(record.clinicName)}`;
    if (existingSlugs.has(slug)) continue;

    const systemPrompt = `You are an autonomous peptide clinic writer. You MUST follow every editorial rule below.\n\n${claudeRules}\n\n${writerPrompt}\n\nSAMPLE FORMAT:\n${samplePost}`;

    const userPrompt = `Write a clinic directory post for this verified clinic. Use ONLY the facts in the verified record below. Do NOT invent reviews, ratings, or credentials. If a field is empty or missing, omit that section or state it wasn't found.

VERIFIED RECORD:
${JSON.stringify(record, null, 2)}

Today's date: ${today}

Output a markdown post with YAML frontmatter matching the clinics schema:
---
title: "..."
description: "..."
clinicName: "..."
city: "..."
state: "..."
address: "..."
website: "..."
phone: "..."
doctorName: "..."
services: ["..."]
verified: true
sources: ["..."]
author: "Peptide Atlas Editorial Team"
publishDate: YYYY-MM-DD
---

Then the article body with these sections:
1. Opening paragraph (who, where, what they're known for)
2. Services offered (each service described neutrally, no efficacy claims)
3. About the doctor (ONLY if doctorName and NPI are in the record; credentials from record only)
4. What patients say (summarize real reviews with platform attribution, or state none found)
5. Location and contact

350-800 words. US English. No treatment claims. Every fact from the verified record.`;

    if (DRY_RUN) {
      log('info', `DRY RUN: would write clinic ${slug}`);
      written++;
      continue;
    }

    try {
      const response = await chat({
        system: systemPrompt,
        user: userPrompt,
        model: CONFIG.models.writing,
        temperature: 0.6,
      });

      const generatedPost = stripMarkdownFences(response);
      const fm = parseFrontmatter(generatedPost);
      if (!fm || !fm.data.clinicName) {
        log('warn', `write-clinics: skipping malformed post for ${slug}`);
        const debugPath = join(PIPELINE, 'drafts', 'clinics', `_malformed-${Date.now()}.md`);
        writeText(debugPath, generatedPost);
        continue;
      }

      const cleaned = canonicalClinicPost({ parsed: fm, record, today });
      if (!cleaned) {
        log('warn', `write-clinics: ${slug} returned an empty body, description, or source list`);
        continue;
      }

      const outPath = join(PIPELINE, 'drafts', 'clinics', `${slug}.md`);

      // Generate image
      const imagePath = await generateImage('clinics', {
        clinicName: record.clinicName,
        city: record.city,
        state: record.state,
        services: record.services,
      }, slug);

      let postWithImage = cleaned;
      if (imagePath) {
        postWithImage = cleaned.replace(
          /^(---\n[\s\S]*?publishDate:\s*\d{4}-\d{2}-\d{2}\n)/m,
          `$1image: "${imagePath}"\n`
        );
      }

      writeText(outPath, postWithImage);
      log('info', `write-clinics: drafted ${slug}${imagePath ? ' with image' : ''}`);
      written++;
    } catch (e) {
      log('error', `write-clinics: failed for ${slug}: ${e.message}`);
    }
  }

  return written;
}

async function runWriteDoctors() {
  log('info', 'orchestrator: write-doctors');
  const today = new Date().toISOString().slice(0, 10);

  const todayCount = countToday('doctors');
  if (todayCount >= CONFIG.velocity.maxDirPerDay) {
    log('info', `write-doctors: velocity cap reached (${todayCount}/${CONFIG.velocity.maxDirPerDay})`);
    return 0;
  }

  const verifiedDir = join(PIPELINE, 'data', 'verified', 'doctors');
  if (!existsSync(verifiedDir)) {
    log('info', 'write-doctors: no verified doctor data');
    return 0;
  }

  const verifiedFiles = listFiles(verifiedDir, /\.json$/);
  if (verifiedFiles.length === 0) {
    log('info', 'write-doctors: no verified doctors');
    return 0;
  }

  // Skip doctors that already have drafts or published posts
  const existingSlugs = new Set([
    ...findFiles(join(PIPELINE, 'drafts', 'doctors'), /\.md$/).map((p) => basename(p, '.md')),
    ...findFiles(join(PIPELINE, 'humanised', 'doctors'), /\.md$/).map((p) => basename(p, '.md')),
    ...findFiles(join(ROOT, 'sites', 'doctors', 'src', 'content', 'doctors'), /\.md$/).map((p) => basename(p, '.md')),
  ]);

  // Group verified doctors by state+specialty for roundups
  const byGroup = {};
  for (const vf of verifiedFiles) {
    const record = readJson(vf);
    if (!record || !record.verified) continue;
    const key = `${record.state}-${record.specialty}`;
    if (!byGroup[key]) byGroup[key] = [];
    byGroup[key].push(record);
  }

  const available = Math.max(0, CONFIG.velocity.maxDirPerDay - todayCount);
  let written = 0;

  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-doctors.md')) || '';
  const samplePost = readText(join(ROOT, 'sites', 'doctors', 'src', 'content', 'doctors', '_sample-florida-top-glp1.md')) || '';

  // Write roundups for groups with 3+ doctors, profiles for singletons
  for (const [groupKey, doctors] of Object.entries(byGroup)) {
    if (written >= available) break;

    const [state, specialty] = groupKey.split('-');
    const isRoundup = doctors.length >= 3;
    const slug = isRoundup
      ? `${state.toLowerCase()}-top-${slugify(specialty)}`
      : `${state.toLowerCase()}-${slugify(doctors[0].doctorName || doctors[0].slug || 'doctor')}`;

    if (existingSlugs.has(slug)) continue;

    const systemPrompt = `You are an autonomous peptide doctor directory writer. You MUST follow every editorial rule below.\n\n${claudeRules}\n\n${writerPrompt}\n\nSAMPLE FORMAT:\n${samplePost}`;

    const userPrompt = isRoundup
      ? `Write a "Top N" doctor roundup for ${specialty} physicians in ${state}.

VERIFIED DOCTORS (${doctors.length}):
${JSON.stringify(doctors.map((d) => ({
        name: d.doctorName,
        city: d.city,
        specialty: d.specialty,
        credentials: d.credentials || '',
        npi: d.npi || '',
        ratingValue: d.ratingValue,
        ratingCount: d.ratingCount,
        ratingSource: d.ratingSource,
        services: d.services || [],
      })), null, 2)}

Today's date: ${today}

Output a markdown post with YAML frontmatter matching the doctors schema:
---
title: "Top ${doctors.length} ${specialty} Doctors in ${state} (${today.slice(0,4)})"
description: "..."
kind: "roundup"
state: "${state}"
specialty: "${specialty}"
methodology: "Compiled from public physician directories, the NPI registry, state licensing records, and published patient ratings. Ranked by verified ${specialty} service offering, years in practice, and volume of public patient ratings. No physician paid for inclusion."
sources: ["https://npiregistry.cms.hhs.gov"]
verified: true
author: "Peptide Atlas Editorial Team"
publishDate: ${today}
---

Body: intro paragraph → numbered list (1 per doctor with verified facts) → "How to choose" section.
1,000–1,500 words. No treatment claims.`
      : `Write a doctor profile for this verified physician.

VERIFIED RECORD:
${JSON.stringify(doctors[0], null, 2)}

Today's date: ${today}

Output a markdown post with YAML frontmatter matching the doctors schema:
---
title: "${doctors[0].doctorName || 'Doctor Profile'} | ${doctors[0].city || ''}, ${state}"
description: "..."
kind: "profile"
state: "${state}"
specialty: "${doctors[0].specialty || specialty}"
doctorName: "${doctors[0].doctorName || ''}"
npi: "${doctors[0].npi || ''}"
sources: ["https://npiregistry.cms.hhs.gov"]
verified: true
author: "Peptide Atlas Editorial Team"
publishDate: ${today}
---

Body: opening → credentials → services → patient reviews (attributed or "none found") → location/contact.
700–1,000 words. No treatment claims. Facts only from the verified record.`;

    if (DRY_RUN) {
      log('info', `DRY RUN: would write doctor ${slug} (${isRoundup ? 'roundup' : 'profile'})`);
      written++;
      continue;
    }

    try {
      const response = await chat({
        system: systemPrompt,
        user: userPrompt,
        model: CONFIG.models.writing,
        temperature: 0.6,
      });

      const cleaned = stripMarkdownFences(response);
      const fm = parseFrontmatter(cleaned);
      if (!fm || !fm.data.title) {
        log('warn', `write-doctors: skipping malformed post for ${slug}`);
        const debugPath = join(PIPELINE, 'drafts', 'doctors', `_malformed-${Date.now()}.md`);
        writeText(debugPath, cleaned);
        continue;
      }

      const outPath = join(PIPELINE, 'drafts', 'doctors', `${slug}.md`);

      const imagePath = await generateImage('doctors', {
        title: fm.data.title,
        specialty: fm.data.specialty,
        state: fm.data.state,
      }, slug);

      let postWithImage = cleaned;
      if (imagePath) {
        postWithImage = cleaned.replace(
          /^(---\n[\s\S]*?publishDate:\s*\d{4}-\d{2}-\d{2}\n)/m,
          `$1image: "${imagePath}"\n`
        );
      }

      writeText(outPath, postWithImage);
      log('info', `write-doctors: drafted ${slug} (${isRoundup ? 'roundup' : 'profile'})${imagePath ? ' with image' : ''}`);
      written++;
    } catch (e) {
      log('error', `write-doctors: failed for ${slug}: ${e.message}`);
    }
  }

  return written;
}
async function runWriteUpdates() {
  const now = new Date();
  const explicit = process.argv[2] === 'write-updates';
  if (!explicit && now.getDay() !== 0) {
    log('info', 'write-updates: weekly digest runs on Sunday');
    return 0;
  }
  const cutoff = now.getTime() - 7 * 86_400_000;
  const recent = [];
  for (const collection of ['news', 'legal', 'blog', 'clinics', 'doctors']) {
    for (const file of findFiles(contentDirFor(collection), /\.md$/, /_sample/)) {
      const text = readText(file) || '';
      const parsed = parseFrontmatter(text);
      const date = extractDate(text);
      if (!parsed?.data?.title || !date || new Date(`${date}T00:00:00Z`).getTime() < cutoff) continue;
      const slug = basename(file, '.md');
      const domain = collection === 'clinics' ? 'https://mypeptide.club' : collection === 'doctors' ? 'https://toppeptideslist.com' : collection === 'news' ? 'https://peptidesnews.us' : collection === 'updates' ? 'https://peptidesupdates.com' : 'https://safepeptides.us';
      const path = collection === 'doctors' || collection === 'news' ? `/${slug}/` : `/${collection}/${slug}/`;
      recent.push({ collection, title: parsed.data.title, url: `${domain}${path}` });
    }
  }
  if (recent.length < 3) {
    log('info', `write-updates: only ${recent.length} eligible items; minimum is 3`);
    return 0;
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((now - start) / 86_400_000) + start.getUTCDay() + 1) / 7);
  const slug = `${now.getUTCFullYear()}-w${String(week).padStart(2, '0')}`;
  const outPath = join(PIPELINE, 'drafts', 'updates', `${slug}.md`);
  if (existsSync(outPath) || existsSync(join(contentDirFor('updates'), `${slug}.md`))) return 0;
  const sections = [];
  for (const [heading, collections] of [['News and analysis', ['news', 'blog']], ['Laws and legal', ['legal']], ['New clinics', ['clinics']], ['Doctor research', ['doctors']]]) {
    const items = recent.filter((item) => collections.includes(item.collection));
    if (items.length) sections.push(`## ${heading}\n\n${items.map((item) => `- [${item.title}](${item.url})`).join('\n')}`);
  }
  const weekOf = new Date(now.getTime() - now.getDay() * 86_400_000).toISOString().slice(0, 10);
  const body = `---\ntitle: "Peptide Atlas weekly review: ${weekOf}"\ndescription: "A source-led summary of this week's peptide reporting, directory additions, and regulatory coverage."\nweekOf: ${weekOf}\npublishDate: ${now.toISOString().slice(0, 10)}\nauthor: "Peptide Atlas Editorial Team"\n---\n\nThis weekly review gathers the material published across Peptide Atlas during the last seven days. Follow each link for full sourcing and context.\n\n${sections.join('\n\n')}\n\n## Editorial note\n\nThis digest is informational. It does not provide medical or legal advice. Readers should use the linked primary sources and consult qualified professionals for individual decisions.\n`;
  if (DRY_RUN) {
    log('info', `DRY RUN: would create weekly digest ${slug}`);
    return 1;
  }
  writeText(outPath, body);
  log('info', `write-updates: drafted ${slug} with ${recent.length} links`);
  return 1;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const stage = process.argv[2] || 'all';
  const hour = new Date().getHours();

  const allowedStages = new Set([
    'all', 'fetch-news', 'fetch-clinics', 'fetch-doctors', 'verify', 'write-news',
    'write-blog', 'write-clinics', 'write-doctors', 'write-updates', 'humanise',
    'publish', 'monitor', 'sync-keywords',
  ]);
  if (!allowedStages.has(stage)) throw new Error(`Unknown pipeline stage: ${stage}`);

  const runRecord = DRY_RUN
    ? null
    : await startRun(stage, { dryRun: false, model: CONFIG.models.writing });

  log('info', `=== Orchestrator started: stage=${stage}, hour=${hour}, dry-run=${DRY_RUN}, site=${SITE_DOMAIN} ===`);

  try {
    const outcome = { verified: 0, drafted: 0, humanised: 0, published: 0 };
    if (stage === 'all' || stage === 'sync-keywords') await runSyncKeywords();
    if (stage === 'all' || stage === 'fetch-news') await runFetch('news');
    if (stage === 'all' || stage === 'fetch-clinics') await runFetch('clinics');
    if (stage === 'all' || stage === 'fetch-doctors') await runFetch('doctors');

    if (stage === 'all' || stage === 'verify') outcome.verified += await runVerify();

    if (stage === 'all' || stage === 'write-news') outcome.drafted += await runWriteNews();
    if (stage === 'all' || stage === 'write-blog') outcome.drafted += await runWriteBlog();
    if (stage === 'all' || stage === 'write-clinics') outcome.drafted += await runWriteClinics();
    if (stage === 'all' || stage === 'write-doctors') outcome.drafted += await runWriteDoctors();
    if (stage === 'all' || stage === 'write-updates') outcome.drafted += await runWriteUpdates();

    if (stage === 'all' || stage === 'humanise') outcome.humanised += await runHumanise();
    if (stage === 'all' || stage === 'publish') outcome.published += await runPublish();
    if (stage === 'all' || stage === 'monitor') await runMonitor();

    const outcomeSummary = `Completed stage ${stage}: verified=${outcome.verified}, drafted=${outcome.drafted}, humanised=${outcome.humanised}, published=${outcome.published}`;
    if (stage === 'all' && !DRY_RUN && outcome.published === 0) {
      log('warn', `orchestrator: completed safely with zero publications (${outcomeSummary})`);
    }
    if (!DRY_RUN) await finishRun(runRecord?.id, 'success', outcomeSummary);
    log('info', '=== Orchestrator finished ===');
  } catch (error) {
    if (!DRY_RUN) await finishRun(runRecord?.id, 'failed', `Failed stage ${stage}`, error.message);
    throw error;
  }
}

main().catch((e) => {
  log('error', `orchestrator crashed: ${e.message}`);
  process.exit(1);
});
