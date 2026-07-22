import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const projects = [
  { name: 'clinics', root: join(ROOT, 'site'), canonical: 'https://mypeptide.club/', sitemaps: ['https://mypeptide.club/sitemap-index.xml'], faqPaths: ['faq'] },
  { name: 'doctors', root: join(ROOT, 'sites', 'doctors'), canonical: 'https://toppeptideslist.com/', sitemaps: ['https://toppeptideslist.com/sitemap-index.xml'], faqPaths: ['faq'] },
  { name: 'content', root: join(ROOT, 'sites', 'content'), canonical: 'https://safepeptides.us/', sitemaps: ['https://safepeptides.us/sitemap-safe.xml'], faqPaths: ['blog/faq', 'legal/faq'], feeds: ['blog/feed.xml'] },
  { name: 'news', root: join(ROOT, 'sites', 'news'), canonical: 'https://peptidesnews.us/', sitemaps: ['https://peptidesnews.us/sitemap-index.xml'], faqPaths: ['faq'] },
  { name: 'updates', root: join(ROOT, 'sites', 'updates'), canonical: 'https://peptidesupdates.com/', sitemaps: ['https://peptidesupdates.com/sitemap-index.xml'], faqPaths: ['faq'], feeds: ['feed.xml'] },
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
  const vercel = JSON.parse(readFileSync(join(project.root, 'vercel.json'), 'utf8'));
  const configuredHeaders = new Set((vercel.headers || []).flatMap((rule) => rule.headers || []).map((header) => header.key));
  for (const requiredHeader of ['Content-Security-Policy', 'Permissions-Policy', 'Referrer-Policy', 'X-Content-Type-Options', 'X-Frame-Options', 'X-XSS-Protection', 'Cross-Origin-Opener-Policy']) {
    if (!configuredHeaders.has(requiredHeader)) errors.push(`${project.name}: ${requiredHeader} is missing from vercel.json`);
  }
  const brandMarkPath = join(project.root, 'public', 'brand-mark.svg');
  const svgFaviconPath = join(project.root, 'public', 'favicon.svg');
  if (!existsSync(brandMarkPath)) errors.push(`${project.name}: shared logo is missing`);
  for (const favicon of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) {
    if (!existsSync(join(project.root, 'public', favicon))) errors.push(`${project.name}: ${favicon} is missing`);
  }
  if (existsSync(brandMarkPath) && existsSync(svgFaviconPath) && !readFileSync(brandMarkPath).equals(readFileSync(svgFaviconPath))) {
    errors.push(`${project.name}: header brand mark has drifted from favicon.svg`);
  }
  const securityTxt = join(project.root, 'public', '.well-known', 'security.txt');
  if (!existsSync(securityTxt)) errors.push(`${project.name}: .well-known/security.txt is missing`);
  if (!existsSync(join(project.root, 'public', 'fonts', 'plus-jakarta-sans-latin.woff2'))) errors.push(`${project.name}: shared font is missing`);
  for (const sitemap of project.sitemaps) {
    if (!robots.includes(sitemap)) errors.push(`${project.name}: robots.txt is missing ${sitemap}`);
  }

  for (const faqRelative of project.faqPaths) {
    const faqPath = join(dist, ...faqRelative.split('/'), 'index.html');
    if (!existsSync(faqPath)) {
      errors.push(`${project.name}: FAQ center ${faqRelative} is missing`);
      continue;
    }
    const faqHtml = readFileSync(faqPath, 'utf8');
    const faqCount = (faqHtml.match(/<details\b/g) || []).length;
    const faqIds = [...faqHtml.matchAll(/<details[^>]+id="([^"]+)"/g)].map((match) => match[1]);
    if (faqCount !== 100) errors.push(`${project.name}: expected exactly 100 focused FAQ answers at ${faqRelative}, found ${faqCount}`);
    if (new Set(faqIds).size !== faqCount) errors.push(`${project.name}: duplicate FAQ identifiers found at ${faqRelative}`);
    if (!faqHtml.includes('id="faq-search"')) errors.push(`${project.name}: FAQ search control is missing at ${faqRelative}`);
  }

  for (const feedRelative of project.feeds || []) {
    const feedPath = join(dist, ...feedRelative.split('/'));
    if (!existsSync(feedPath)) {
      errors.push(`${project.name}: RSS feed ${feedRelative} is missing`);
      continue;
    }
    const feedXml = readFileSync(feedPath, 'utf8');
    if (!feedXml.includes('<rss version="2.0">') || /_sample|example\.com/i.test(feedXml)) {
      errors.push(`${project.name}: RSS feed ${feedRelative} is invalid`);
    }
  }

  for (const file of filesUnder(dist).filter((path) => /\.(html|xml)$/i.test(path))) {
    const text = readFileSync(file, 'utf8');
    if (/_sample|example\.com/i.test(text)) errors.push(`${project.name}: sample or example content leaked into ${file}`);
    if (/\u2014|â€”/.test(text)) errors.push(`${project.name}: em dash found in ${file}`);
    if (/https:\/\/[^"'<\s]*\.vercel\.app/i.test(text)) errors.push(`${project.name}: legacy Vercel hostname leaked into ${file}`);
    if (file.endsWith('.html')) {
      if (/theme-switcher|peptide-theme/.test(text)) errors.push(`${project.name}: removed theme switcher leaked into ${file}`);
      if (!text.includes('/brand-mark.svg')) errors.push(`${project.name}: logo is missing from ${file}`);
      if (!text.includes('/favicon.svg') || !text.includes('/apple-touch-icon.png')) errors.push(`${project.name}: favicon links are missing from ${file}`);
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
