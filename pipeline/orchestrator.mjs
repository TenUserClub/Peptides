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
 * Environment: .env (OPENAI_API_KEY, EXA_API_KEY, GEMINI_API_KEY, SITE_DOMAIN, SUPABASE_URL, SUPABASE_SERVICE_KEY)
 */

import { join, dirname, basename } from 'node:path';
import { execSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync, unlinkSync,
} from 'node:fs';
import { loadEnv, requireEnv, readJson, writeJson, log, PIPELINE, ROOT } from './scripts/lib.mjs';
import { chat } from './lib/llm.mjs';
import { generateImage } from './lib/images.mjs';

loadEnv();

requireEnv('OPENAI_API_KEY');
const rawDomain = process.env.SITE_DOMAIN || '';
const SITE_DOMAIN = rawDomain && !rawDomain.startsWith('#')
  ? rawDomain.trim()
  : 'peptide-seo-site.vercel.app';

// ── Configuration ──────────────────────────────────────────────
const CONFIG = {
  models: {
    writing: 'gpt-4o',
    humanise: 'gpt-4o',
    verify: 'gpt-4o-mini',
    summary: 'gpt-4o-mini',
  },
  velocity: {
    maxNewsPerDay: 3,
    maxLegalPerDay: 3,
    maxDirPerDay: 5,
    maxBlogPerDay: 2,
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

// ── Web fetch ──────────────────────────────────────────────────
async function webFetch(url, opts = {}) {
  const { maxRetries = CONFIG.web.maxRetries, timeout = CONFIG.web.timeout } = opts;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(url, {
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
      log('warn', `webFetch retry ${i + 1} for ${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

// ── Count helpers ──────────────────────────────────────────────
function countToday(collection, date = null) {
  const d = date || new Date().toISOString().slice(0, 10);
  const dir = join(ROOT, 'site', 'src', 'content', collection);
  if (!existsSync(dir)) return 0;
  return findFiles(dir, /\.md$/, /_sample|\.diff\.md/)
    .filter((p) => extractDate(readText(p)) === d)
    .length;
}

function allTitles(collection) {
  const dir = join(ROOT, 'site', 'src', 'content', collection);
  if (!existsSync(dir)) return [];
  return findFiles(dir, /\.md$/, /_sample|\.diff\.md/)
    .map((p) => extractTitle(readText(p)))
    .filter(Boolean);
}

// ── Stage: Fetch ───────────────────────────────────────────────
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

  const allStories = exaData.sets.flatMap((s) => s.results || []);
  if (allStories.length === 0) {
    log('info', 'write-news: no stories in exa data');
    return 0;
  }

  const existingTitles = [...allTitles('news'), ...allTitles('legal')];
  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-news.md')) || '';
  const samplePost = readText(join(ROOT, 'site', 'src', 'content', 'news', '_sample-fda-reclassification.md')) || '';

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
      text: (r.text || '').slice(0, 1000),
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

      const slug = `${today}-${slugify(fm.data.title)}`;
      const outPath = join(PIPELINE, 'drafts', 'news', `${slug}.md`);

      const collection = fm.data.jurisdiction ? 'legal' : 'news';
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
  const claudeRules = readText(join(ROOT, 'CLAUDE.md')) || '';
  const writerPrompt = readText(join(PIPELINE, 'prompts', 'write-blog.md')) || '';
  const samplePost = readText(join(ROOT, 'site', 'src', 'content', 'blog', '_sample-beginners-guide.md')) || '';

  const systemPrompt = `You are an autonomous peptide blog writer. You MUST follow every editorial rule below.\n\n${claudeRules}\n\n${writerPrompt}\n\nSAMPLE FORMAT:\n${samplePost}`;

  const userPrompt = `Today's date: ${today}
Blog posts already published today: ${todayCount}
Maximum allowed today: ${CONFIG.velocity.maxBlogPerDay}
You may write up to: ${available} posts

EXISTING BLOG POSTS (do not duplicate these topics):
${existingTitles.map((t) => `- ${t}`).join('\n') || '(none yet)'}

EXISTING NEWS TOPICS (avoid overlap — blog is evergreen, news is time-sensitive):
${existingNewsTitles.slice(0, 20).map((t) => `- ${t}`).join('\n') || '(none yet)'}

INSTRUCTIONS:
1. Write ${available} evergreen educational blog post(s) about peptide therapy
2. Choose topics that fill gaps — what would a patient researching peptide therapy want to know?
3. For each post, write a markdown post with YAML frontmatter matching this schema. Output RAW markdown — do NOT wrap in \`\`\`markdown code blocks:
   ---
   title: "..."
   description: "..."
   category: "beginners" | "guides" | "comparisons" | "science" | "cost" | "safety"
   tags: ["tag1", "tag2"]
   publishDate: YYYY-MM-DD
   ---
4. Separate each post with: <!-- POST SEPARATOR -->
5. 1,000-1,500 words per post
6. No treatment claims. Every medical claim sourced.
7. Include internal links where relevant (e.g., link to /clinics/ or /doctors/ pages)`;

  if (DRY_RUN) {
    log('info', 'DRY RUN: would call OpenAI to write blog posts');
    return 0;
  }

  try {
    const response = await chat({
      system: systemPrompt,
      user: userPrompt,
      model: CONFIG.models.writing,
      temperature: 0.65,
    });

    const posts = response
      .split('<!-- POST SEPARATOR -->')
      .map((s) => s.trim())
      .filter(Boolean);
    let written = 0;

    for (const post of posts) {
      const fm = parseFrontmatter(post);
      if (!fm || !fm.data.title) {
        const preview = post.slice(0, 200).replace(/\n/g, '\\n');
        log('warn', `write-blog: skipping malformed post (preview: ${preview}...)`);
        const debugPath = join(PIPELINE, 'drafts', 'blog', `_malformed-${Date.now()}.md`);
        writeText(debugPath, post);
        continue;
      }

      const category = fm.data.category || 'guides';
      const slug = `${category}-${slugify(fm.data.title)}`;
      const outPath = join(PIPELINE, 'drafts', 'blog', `${slug}.md`);

      const imagePath = await generateImage('blog', {
        title: fm.data.title,
        description: fm.data.description,
      }, slug);

      let postWithImage = post;
      if (imagePath) {
        postWithImage = post.replace(
          /^(---\n[\s\S]*?publishDate:\s*\d{4}-\d{2}-\d{2}\n)/m,
          `$1image: "${imagePath}"\n`
        );
      }

      writeText(outPath, postWithImage);
      log('info', `write-blog: drafted ${slug}${imagePath ? ' with image' : ''}`);
      written++;
    }

    return written;
  } catch (e) {
    log('error', `write-blog: ${e.message}`);
    return 0;
  }
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

  const rubricMatch = claudeRules.match(/## Humaniser rubric[\s\S]*?(?=## Velocity|$)/);
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

      const cleanedResponse = stripMarkdownFences(response);
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
async function runPublish() {
  log('info', 'orchestrator: publish');
  const humanisedDir = join(PIPELINE, 'humanised');
  const files = findFiles(humanisedDir, /\.md$/, /\.diff\.md/);
  if (files.length === 0) {
    log('info', 'publish: nothing to publish');
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const contentDir = join(ROOT, 'site', 'src', 'content');
  const allPublished = findFiles(contentDir, /\.md$/, /_sample/);
  const publishedTitles = allPublished
    .map((p) => extractTitle(readText(p)))
    .filter(Boolean);

  const todayDirCount = countToday('clinics') + countToday('doctors');
  const todayNewsCount = countToday('news') + countToday('legal');
  const todayBlogCount = countToday('blog');

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

    if (isDir && todayDirCount >= CONFIG.velocity.maxDirPerDay) {
      log('info', `publish: directory cap reached (${todayDirCount}/${CONFIG.velocity.maxDirPerDay})`);
      continue;
    }
    if (isNews && todayNewsCount >= CONFIG.velocity.maxNewsPerDay) {
      log('info', `publish: news cap reached (${todayNewsCount}/${CONFIG.velocity.maxNewsPerDay})`);
      continue;
    }
    if (isBlog && todayBlogCount >= CONFIG.velocity.maxBlogPerDay) {
      log('info', `publish: blog cap reached (${todayBlogCount}/${CONFIG.velocity.maxBlogPerDay})`);
      continue;
    }

    if (publishedTitles.includes(fm.data.title)) {
      log('warn', `publish: duplicate title "${fm.data.title}", removing`);
      unlinkSync(file);
      const diffFile = file.replace(/\.md$/, '.diff.md');
      if (existsSync(diffFile)) unlinkSync(diffFile);
      continue;
    }

    const targetPath = join(contentDir, collection, basename(file));
    if (existsSync(targetPath)) {
      log('warn', `publish: already exists ${basename(file)}, removing from humanised`);
      unlinkSync(file);
      const diffFile = file.replace(/\.md$/, '.diff.md');
      if (existsSync(diffFile)) unlinkSync(diffFile);
      continue;
    }

    toMove.push({ file, targetPath, collection, title: fm.data.title, isDir, isNews, isBlog });
  }

  if (toMove.length === 0) {
    log('info', 'publish: no files passed validation');
    return 0;
  }

  if (DRY_RUN) {
    log('info', `DRY RUN: would publish ${toMove.length} posts:`);
    for (const item of toMove) {
      log('info', `  - ${item.title} → ${item.collection}`);
    }
    return toMove.length;
  }

  for (const item of toMove) {
    mkdirSync(dirname(item.targetPath), { recursive: true });
    renameSync(item.file, item.targetPath);
    log('info', `publish: moved ${item.title} → ${item.collection}`);
    const diffFile = item.file.replace(/\.md$/, '.diff.md');
    if (existsSync(diffFile)) unlinkSync(diffFile);
  }

  log('info', 'publish: building site');
  try {
    execSync('npm run build', { cwd: join(ROOT, 'site'), stdio: 'pipe' });
    log('info', 'publish: build successful');
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

  log('info', 'publish: committing');
  try {
    execSync(`git add -A && git commit -m "publish: auto-posts ${today}"`, { cwd: ROOT, stdio: 'pipe' });
    log('info', 'publish: committed. Run `git push` to deploy to Vercel.');
  } catch (e) {
    log('warn', `publish: git commit issue: ${e.message}`);
  }

  advanceQueues();

  return toMove.length;
}

// ── Queue advancement ──────────────────────────────────────────
function advanceQueues() {
  const citiesPath = join(PIPELINE, 'queue', 'cities.json');
  const cities = readJson(citiesPath);
  if (cities && cities.inFlight) {
    log('info', `publish: queue check — cities in-flight: ${cities.inFlight.label}`);
  }

  const statesPath = join(PIPELINE, 'queue', 'states.json');
  const states = readJson(statesPath);
  if (states && states.inFlight) {
    log('info', `publish: queue check — states in-flight: ${states.inFlight.label}`);
  }
}

// ── Stage: Monitor ─────────────────────────────────────────────
async function runMonitor() {
  log('info', 'orchestrator: monitor');

  // Write daily summary
  const summaryPath = join(PIPELINE, 'logs', 'daily-summary.md');
  const today = new Date().toISOString().slice(0, 10);
  const logPath = join(PIPELINE, 'logs', `${today}.log`);
  const logs = readText(logPath) || 'No logs today.';

  // Count published posts today
  const todayNews = countToday('news') + countToday('legal');
  const todayBlog = countToday('blog');
  const todayClinics = countToday('clinics');
  const todayDoctors = countToday('doctors');

  const summary = `## Daily Summary — ${today}

### Pipeline Activity
${logs}

### Published Today
- News + Legal: ${todayNews}
- Blog: ${todayBlog}
- Clinics: ${todayClinics}
- Doctors: ${todayDoctors}

### Status
- Site: ${SITE_DOMAIN}
- Next run: check cron schedule

---

`;
  writeText(summaryPath, summary);
  log('info', 'monitor: summary written');
}

// ── Stage: Verify ───────────────────────────────────────────────
async function runVerify() {
  log('info', 'orchestrator: verify');
  const exaDir = join(PIPELINE, 'data', 'exa', 'clinics');
  const exaFiles = listFiles(exaDir, /\.json$/).sort();
  if (exaFiles.length === 0) {
    log('info', 'verify: no exa clinic data to process');
    return 0;
  }

  const processedPath = join(PIPELINE, 'data', '.processed-clinics.json');
  const processed = readJson(processedPath, { files: [] });

  let verified = 0;
  let rejected = 0;

  for (const file of exaFiles) {
    const fileName = basename(file);
    if (processed.files.includes(fileName)) {
      log('info', `verify: skipping already processed ${fileName}`);
      continue;
    }

    const data = readJson(file);
    if (!data || !data.results || data.results.length === 0) {
      processed.files.push(fileName);
      writeJson(processedPath, processed);
      continue;
    }

    const city = data.city || {};
    log('info', `verify: processing ${city.city || 'unknown'}, ${city.state || 'unknown'} (${data.results.length} results)`);

    // Use OpenAI to extract structured clinic candidates from raw Exa text
    const extractionPrompt = `Extract peptide therapy clinics from the following web search results for ${city.city || ''}, ${city.state || ''}.

For each clinic, extract ONLY what is explicitly stated in the results:
- clinicName: exact name
- city, state
- address (if present)
- phone (if present)
- website (URL if present)
- doctorName (named practitioner if present)
- services: list of peptide-related services mentioned
- ratingValue, ratingCount, ratingSource (only if a specific platform is named)
- sourceUrl: the URL of the search result this came from

If a result is NOT about a specific clinic (e.g., a blog post, news article, or vendor site), skip it.
If a result looks like a "research chemical" vendor or sells peptides "for research use only", mark it rejected.

Output as JSON: { "candidates": [ { ... } ], "rejected": [ { "reason": "...", "sourceUrl": "..." } ] }

EXA RESULTS:
${JSON.stringify(data.results.map((r) => ({ title: r.title, url: r.url, text: (r.text || '').slice(0, 2000) })), null, 2)}`;

    let candidates = [];
    let rejects = [];

    try {
      if (DRY_RUN) {
        log('info', `DRY RUN: would extract clinics from ${fileName}`);
        processed.files.push(fileName);
        writeJson(processedPath, processed);
        continue;
      }

      const response = await chat({
        system: 'You extract structured clinic data from web search results. Output ONLY valid JSON. Never invent data not present in the source.',
        user: extractionPrompt,
        model: CONFIG.models.verify,
        temperature: 0.3,
        jsonMode: true,
      });

      const parsed = JSON.parse(response);
      candidates = parsed.candidates || [];
      rejects = parsed.rejected || [];
    } catch (e) {
      log('error', `verify: extraction failed for ${fileName}: ${e.message}`);
      continue;
    }

    // Verify each candidate
    for (const c of candidates) {
      const record = {
        clinicName: c.clinicName || '',
        city: c.city || city.city || '',
        state: c.state || city.state || '',
        address: c.address || '',
        phone: c.phone || '',
        website: c.website || '',
        doctorName: c.doctorName || '',
        services: Array.isArray(c.services) ? c.services : [],
        ratingValue: c.ratingValue || null,
        ratingCount: c.ratingCount || null,
        ratingSource: c.ratingSource || '',
        sourceUrls: [c.sourceUrl].filter(Boolean),
        verified: false,
        verificationNotes: [],
      };

      // Skip if no clinic name
      if (!record.clinicName) {
        rejects.push({ reason: 'Missing clinic name', sourceUrl: c.sourceUrl });
        continue;
      }

      // Website verification: fetch and check for peptide mention
      if (record.website) {
        try {
          const siteText = await webFetch(record.website, { maxRetries: 1, timeout: 8000 });
          const hasPeptide = /peptide|GLP-1|semaglutide|tirzepatide/i.test(siteText);
          if (!hasPeptide) {
            record.verificationNotes.push('Website does not mention peptide therapy');
          }
        } catch (e) {
          record.verificationNotes.push(`Website unreachable: ${e.message}`);
        }
      } else {
        record.verificationNotes.push('No website provided');
      }

      // NPI verification for named doctor
      if (record.doctorName) {
        const nameParts = record.doctorName.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        if (firstName && lastName && record.state) {
          try {
            const npiOutput = execSync(
              `node "${join(PIPELINE, 'scripts', 'npi-verify.mjs')}" "${firstName}" "${lastName}" ${record.state}`,
              { cwd: ROOT, encoding: 'utf8', timeout: 15000 }
            );
            const npiData = JSON.parse(npiOutput);
            if (npiData.count === 1) {
              record.npi = npiData.matches[0].npi;
              record.verificationNotes.push(`NPI verified: ${record.npi}`);
            } else if (npiData.ambiguous) {
              record.verificationNotes.push('NPI ambiguous — multiple matches');
              record.doctorName = ''; // Drop name per CLAUDE.md
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
      const hasPeptideService = record.services.some((s) => /peptide|GLP-1|hormone|longevity/i.test(s));
      const isVerifiable = hasWebsite && (hasPeptideService || record.verificationNotes.some((n) => n.includes('peptide')));

      if (isVerifiable) {
        record.verified = true;
        const slug = `${record.city.toLowerCase().replace(/\s+/g, '-')}-${record.state.toLowerCase()}-${slugify(record.clinicName)}`;
        const outPath = join(PIPELINE, 'data', 'verified', 'clinics', `${slug}.json`);
        writeJson(outPath, record);
        verified++;
      } else {
        rejects.push({ reason: `Not verifiable: ${record.verificationNotes.join('; ')}`, clinicName: record.clinicName });
      }
    }

    // Write rejected records
    for (const r of rejects) {
      const outPath = join(PIPELINE, 'data', 'rejected', `rejected-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`);
      writeJson(outPath, { ...r, city: city.city, state: city.state });
      rejected++;
    }

    processed.files.push(fileName);
    writeJson(processedPath, processed);
    log('info', `verify: ${verified} verified, ${rejected} rejected from ${fileName}`);
  }

  return verified;
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
publishDate: YYYY-MM-DD
---

Then the article body with these sections:
1. Opening paragraph (who, where, what they're known for)
2. Services offered (each service described neutrally, no efficacy claims)
3. About the doctor (ONLY if doctorName and NPI are in the record; credentials from record only)
4. What patients say (summarize real reviews with platform attribution, or state none found)
5. Location and contact

700–1,100 words. US English. No treatment claims. Every fact from the verified record.`;

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

      const cleaned = stripMarkdownFences(response);
      const fm = parseFrontmatter(cleaned);
      if (!fm || !fm.data.clinicName) {
        log('warn', `write-clinics: skipping malformed post for ${slug}`);
        const debugPath = join(PIPELINE, 'drafts', 'clinics', `_malformed-${Date.now()}.md`);
        writeText(debugPath, cleaned);
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
  log('info', 'orchestrator: write-doctors (stub — needs verified data)');
  return 0;
}
async function runWriteUpdates() {
  log('info', 'orchestrator: write-updates (stub — needs published posts)');
  return 0;
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const stage = process.argv[2] || 'all';
  const hour = new Date().getHours();

  log('info', `=== Orchestrator started: stage=${stage}, hour=${hour}, dry-run=${DRY_RUN}, site=${SITE_DOMAIN} ===`);

  if (stage === 'all' || stage === 'fetch-news') await runFetch('news');
  if (stage === 'all' || stage === 'fetch-clinics') await runFetch('clinics');
  if (stage === 'all' || stage === 'fetch-doctors') await runFetch('doctors');

  if (stage === 'all' && hour >= 2 && hour < 6) await runVerify();
  else if (stage === 'verify') await runVerify();

  if (stage === 'all' || stage === 'write-news') await runWriteNews();
  if (stage === 'all' || stage === 'write-blog') await runWriteBlog();
  if (stage === 'all' || stage === 'write-clinics') await runWriteClinics();
  if (stage === 'all' || stage === 'write-doctors') await runWriteDoctors();
  if (stage === 'all' || stage === 'write-updates') await runWriteUpdates();

  if (stage === 'all' || stage === 'humanise') await runHumanise();

  if (stage === 'all' || stage === 'publish') await runPublish();

  if (stage === 'all' && hour >= 6 && hour < 8) await runMonitor();
  if (stage === 'all' || stage === 'monitor') await runMonitor();

  log('info', '=== Orchestrator finished ===');
}

main().catch((e) => {
  log('error', `orchestrator crashed: ${e.message}`);
  process.exit(1);
});
