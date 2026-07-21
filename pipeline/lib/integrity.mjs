import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { ROOT, PIPELINE, readJson, log } from '../scripts/lib.mjs';
import { parseFrontmatter, validateContent } from './content-guard.mjs';
import {
  checkPublicationControl,
  getPublicationQueueSnapshot,
  isEnabled,
  recordIntegrityCheck,
  setQueueState,
  upsertPublicationQueueItems,
  withdrawPublicationQueueItems,
} from './db.mjs';

const VERIFIED_ROOT = join(PIPELINE, 'data', 'verified');
const publishedRoots = {
  clinics: join(ROOT, 'site', 'src', 'content', 'clinics'),
  doctors: join(ROOT, 'sites', 'doctors', 'src', 'content', 'doctors'),
  blog: join(ROOT, 'sites', 'content', 'src', 'content', 'blog'),
  legal: join(ROOT, 'sites', 'content', 'src', 'content', 'legal'),
  news: join(ROOT, 'sites', 'news', 'src', 'content', 'news'),
  updates: join(ROOT, 'sites', 'updates', 'src', 'content', 'updates'),
};

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_') && !entry.name.endsWith('.diff.md') ? [path] : [];
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function repoPath(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

function repoState() {
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim()),
    };
  } catch {
    return { commit: null, dirty: true };
  }
}

function sourceContext(collection, itemKey, frontmatter = {}) {
  if (collection === 'clinics' || collection === 'doctors') {
    return readJson(join(VERIFIED_ROOT, collection, `${itemKey}.json`), { frontmatter });
  }
  if (collection === 'blog') {
    const queue = readJson(join(PIPELINE, 'queue', 'blog-topics.json'), { topics: [] });
    return queue.topics.find((topic) => topic.id === itemKey) || { frontmatter };
  }
  return { frontmatter };
}

function contentItem({ collection, path, status, state }) {
  const content = readFileSync(path, 'utf8');
  const parsed = parseFrontmatter(content);
  const itemKey = basename(path, '.md');
  const validation = validateContent({ text: content, collection, filename: path, verifiedRoot: VERIFIED_ROOT });
  const effectiveStatus = status === 'humanised' && !validation.ok ? 'blocked' : status;
  return {
    collection,
    item_key: itemKey,
    title: parsed?.data?.title || itemKey,
    status: effectiveStatus,
    source_file: repoPath(path),
    source_context: sourceContext(collection, itemKey, parsed?.data || {}),
    content_markdown: content,
    content_sha256: sha256(content),
    validation_errors: validation.errors,
    repo_commit: state.commit,
    publish_date: parsed?.data?.publishDate || null,
    published_at: status === 'published' && parsed?.data?.publishDate
      ? `${parsed.data.publishDate}T00:00:00.000Z`
      : null,
    metadata: { words: validation.words, repo_dirty: state.dirty },
  };
}

export async function syncPublicationIntegrity({ write = true } = {}) {
  const state = repoState();
  const items = new Map();
  const setItem = (item) => items.set(`${item.collection}:${item.item_key}`, item);

  for (const [collection, root] of Object.entries(publishedRoots)) {
    for (const path of markdownFiles(root)) setItem(contentItem({ collection, path, status: 'published', state }));
  }

  for (const stage of ['drafts', 'humanised']) {
    const root = join(PIPELINE, stage);
    for (const path of markdownFiles(root)) {
      const collection = relative(root, path).split(/[\\/]/)[0];
      if (!publishedRoots[collection]) continue;
      const item = contentItem({ collection, path, status: stage === 'drafts' ? 'drafted' : 'humanised', state });
      if (!items.has(`${collection}:${item.item_key}`)) setItem(item);
    }
  }

  for (const collection of ['clinics', 'doctors']) {
    const verifiedDir = join(VERIFIED_ROOT, collection);
    if (!existsSync(verifiedDir)) continue;
    for (const name of readdirSync(verifiedDir).filter((value) => value.endsWith('.json'))) {
      const itemKey = basename(name, '.json');
      if (items.has(`${collection}:${itemKey}`)) continue;
      const record = readJson(join(verifiedDir, name), {});
      setItem({
        collection,
        item_key: itemKey,
        title: record.clinicName || record.doctorName || itemKey,
        status: record.verified ? 'queued' : 'blocked',
        source_file: repoPath(join(verifiedDir, name)),
        source_context: record,
        content_markdown: null,
        content_sha256: null,
        validation_errors: record.verified ? [] : ['Verified source record is not approved'],
        repo_commit: state.commit,
        publish_date: null,
        published_at: null,
        metadata: { repo_dirty: state.dirty },
      });
    }
  }

  const blogQueue = readJson(join(PIPELINE, 'queue', 'blog-topics.json'), { topics: [] });
  for (const topic of blogQueue.topics || []) {
    if (items.has(`blog:${topic.id}`)) continue;
    setItem({
      collection: 'blog',
      item_key: topic.id,
      title: topic.title,
      status: topic.status === 'ready' ? 'queued' : 'blocked',
      source_file: 'pipeline/queue/blog-topics.json',
      source_context: topic,
      content_markdown: null,
      content_sha256: null,
      validation_errors: topic.status === 'ready' ? [] : [`Topic status is ${topic.status}`],
      repo_commit: state.commit,
      publish_date: null,
      published_at: null,
      metadata: { priority: topic.priority, repo_dirty: state.dirty },
    });
  }

  const records = [...items.values()];
  const invalidPublished = records.filter((item) => item.status === 'published' && item.validation_errors.length);
  const missingContext = records.filter((item) => !item.source_context || Object.keys(item.source_context).length === 0);
  const issues = [
    ...invalidPublished.map((item) => `${item.collection}:${item.item_key}: ${item.validation_errors.join('; ')}`),
    ...missingContext.map((item) => `${item.collection}:${item.item_key}: source context missing`),
  ];
  const status = issues.length ? 'fail' : 'pass';
  let saved = 0;

  if (write && isEnabled()) {
    const cities = readJson(join(PIPELINE, 'queue', 'cities.json'), {});
    const states = readJson(join(PIPELINE, 'queue', 'states.json'), {});
    await setQueueState('cities', {
      next_index: cities.next || 0,
      in_flight_label: cities.inFlight?.label || null,
      in_flight_file: cities.inFlight?.file || null,
      in_flight_at: cities.inFlight?.fetchedAt || null,
      total_processed: cities.next || 0,
      total_published: records.filter((item) => item.collection === 'clinics' && item.status === 'published').length,
    });
    await setQueueState('states', {
      next_index: states.next || 0,
      in_flight_label: states.inFlight?.label || null,
      in_flight_file: states.inFlight?.file || null,
      in_flight_at: states.inFlight?.fetchedAt || null,
      total_processed: states.next || 0,
      total_published: records.filter((item) => item.collection === 'doctors' && item.status === 'published').length,
    });
    const control = await checkPublicationControl();
    if (!control.ok) {
      log('warn', `integrity: Supabase publication control unavailable; apply migration 004 (${control.error})`);
    } else {
    const before = await getPublicationQueueSnapshot();
    const localKeys = new Set(records.map((item) => `${item.collection}:${item.item_key}`));
    const remoteOnly = before.filter((item) => item.status !== 'withdrawn' && !localKeys.has(`${item.collection}:${item.item_key}`));
    const changedHashes = before.filter((item) => {
      const local = items.get(`${item.collection}:${item.item_key}`);
      return local && item.content_sha256 && local.content_sha256 && item.content_sha256 !== local.content_sha256;
    }).map((item) => `${item.collection}:${item.item_key}`);
    saved = await upsertPublicationQueueItems(records);
    const withdrawn = await withdrawPublicationQueueItems(remoteOnly, state.commit);
    const after = await getPublicationQueueSnapshot();
    const afterByKey = new Map(after.map((item) => [`${item.collection}:${item.item_key}`, item]));
    const mirrorMismatches = records.filter((item) => {
      const stored = afterByKey.get(`${item.collection}:${item.item_key}`);
      return !stored || stored.status !== item.status || stored.content_sha256 !== item.content_sha256 || stored.repo_commit !== item.repo_commit;
    }).map((item) => `${item.collection}:${item.item_key}`);
    if (mirrorMismatches.length) {
      issues.push(...mirrorMismatches.map((key) => `${key}: Supabase mirror mismatch`));
    }
    await recordIntegrityCheck({
      scope: 'repository-publication-control',
      status: issues.length ? 'fail' : 'pass',
      repo_commit: state.commit,
      items_checked: records.length,
      issues_found: issues.length,
      details: {
        mirrored: saved,
        withdrawn,
        changed_hashes: changedHashes,
        mirror_mismatches: mirrorMismatches,
        repo_dirty: state.dirty,
        by_status: Object.fromEntries([...new Set(records.map((item) => item.status))].map((value) => [value, records.filter((item) => item.status === value).length])),
        issues,
      },
    });
    }
  }

  log('info', `integrity: checked ${records.length} publication items, mirrored ${saved}, issues ${issues.length}`);
  if (issues.length) throw new Error(`Publication integrity failed: ${issues.slice(0, 5).join(' | ')}`);
  return { checked: records.length, saved, issues: issues.length, status: issues.length ? 'fail' : status };
}
