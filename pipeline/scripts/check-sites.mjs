import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const projects = [
  { name: 'clinics', root: join(ROOT, 'site'), canonical: 'https://mypeptide.club/', sitemaps: ['https://mypeptide.club/sitemap-index.xml'] },
  { name: 'doctors', root: join(ROOT, 'sites', 'doctors'), canonical: 'https://toppeptideslist.com/', sitemaps: ['https://toppeptideslist.com/sitemap-index.xml'] },
  { name: 'content', root: join(ROOT, 'sites', 'content'), canonical: 'https://safepeptides.us/', sitemaps: ['https://safepeptides.us/sitemap-safe.xml'] },
  { name: 'news', root: join(ROOT, 'sites', 'news'), canonical: 'https://peptidesnews.us/', sitemaps: ['https://peptidesnews.us/sitemap-index.xml'] },
  { name: 'updates', root: join(ROOT, 'sites', 'updates'), canonical: 'https://peptidesupdates.com/', sitemaps: ['https://peptidesupdates.com/sitemap-index.xml'] },
];
const errors = [];
const publicDomains = ['https://mypeptide.club', 'https://toppeptideslist.com', 'https://safepeptides.us', 'https://peptidesnews.us', 'https://peptidesupdates.com'];

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function targetFor(dist, href) {
  const clean = href.split(/[?#]/)[0];
  if (clean === '/') return join(dist, 'index.html');
  const relative = clean.replace(/^\//, '');
  if (/\.[a-z0-9]+$/i.test(relative)) return join(dist, relative);
  return join(dist, relative, 'index.html');
}

for (const project of projects) {
  const dist = join(project.root, 'dist');
  if (!existsSync(dist)) {
    errors.push(`${project.name}: dist directory is missing; run the build first`);
    continue;
  }
  const robotsPath = join(project.root, 'public', 'robots.txt');
  const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : '';
  for (const sitemap of project.sitemaps) {
    if (!robots.includes(sitemap)) errors.push(`${project.name}: robots.txt is missing ${sitemap}`);
  }

  const faqPath = join(dist, 'faq', 'index.html');
  if (!existsSync(faqPath)) {
    errors.push(`${project.name}: FAQ center is missing`);
  } else {
    const faqHtml = readFileSync(faqPath, 'utf8');
    const faqCount = (faqHtml.match(/<details\b/g) || []).length;
    if (faqCount < 500 || faqCount > 600) errors.push(`${project.name}: expected 500 to 600 FAQ answers, found ${faqCount}`);
    if (!faqHtml.includes('id="faq-search"')) errors.push(`${project.name}: FAQ search control is missing`);
  }

  for (const file of filesUnder(dist).filter((path) => /\.(html|xml)$/i.test(path))) {
    const text = readFileSync(file, 'utf8');
    if (/_sample|example\.com/i.test(text)) errors.push(`${project.name}: sample or example content leaked into ${file}`);
    if (/\u2014|â€”/.test(text)) errors.push(`${project.name}: em dash found in ${file}`);
    if (/https:\/\/[^"'<\s]*\.vercel\.app/i.test(text)) errors.push(`${project.name}: legacy Vercel hostname leaked into ${file}`);
    if (file.endsWith('.html')) {
      for (const domain of publicDomains) {
        if (!text.includes(domain)) errors.push(`${project.name}: header domain ${domain} is missing from ${file}`);
      }
      if (!text.includes(`<link rel="canonical" href="${project.canonical}`)) {
        errors.push(`${project.name}: wrong canonical domain in ${file}`);
      }
      for (const match of text.matchAll(/href="([^"]+)"/g)) {
        const href = match[1];
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        if (!existsSync(targetFor(dist, href))) errors.push(`${project.name}: broken local link ${href} in ${file}`);
      }
    }
  }
}

const cssHashes = projects.map((project) => createHash('sha256').update(readFileSync(join(project.root, 'public', 'styles', 'global.css'))).digest('hex'));
if (new Set(cssHashes).size !== 1) errors.push('Shared UI styles have drifted between sites');

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log('Site integrity checks passed.');
