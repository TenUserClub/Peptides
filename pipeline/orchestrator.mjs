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

function parseFrontmatter(text) {
  // Handle both LF and CRLF line endings
  const normalized = text.replace(/\r\n/g, '\n');
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
2. For each story, write a markdown post with YAML frontmatter matching this schema:
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
3. For each post, write a markdown post with YAML frontmatter matching this schema:
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

    const systemPrompt = `You are an editor who removes AI-writing signs from draft articles.\n\n${rubric}\n\n${humanisePrompt}\n\nCRITICAL RULES:\n- Never change facts, names, numbers, ratings, platform attributions, URLs, or frontmatter\n- Never change the methodology paragraph's substance\n- Only change style and wording\n- Keep all YAML frontmatter exactly as-is`;

    const userPrompt = `Rewrite the following draft to remove all AI-writing signs. Keep the frontmatter unchanged. Keep all facts exactly as they are.\n\nDRAFT:\n${draftText}\n\nOUTPUT the full rewritten article with frontmatter unchanged.`;

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

      const relativePath = draftPath.replace(draftsDir, '').replace(/^\\/, '');
      const outPath = join(humanisedDir, relativePath);
      const diffPath = outPath.replace(/\.md$/, '.diff.md');

      writeText(outPath, response);

      const diff = `<!-- BEFORE -->\n${draftText}\n\n<!-- AFTER -->\n${response}`;
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

    const relativePath = file.replace(humanisedDir, '').replace(/^\\/, '');
    const collection = relativePath.split('/')[0];
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

// ── Stubs: Verify, Write Clinics/Doctors/Updates ───────────────
async function runVerify() {
  log('info', 'orchestrator: verify (stub — clinic/doctor verification not yet implemented)');
  return 0;
}
async function runWriteClinics() {
  log('info', 'orchestrator: write-clinics (stub — needs verified data)');
  return 0;
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
  if (stage === 'all' || stage === 'verify') await runVerify();

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
