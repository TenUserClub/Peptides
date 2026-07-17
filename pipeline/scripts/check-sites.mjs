import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const projects = [
  { name: 'clinics', root: join(ROOT, 'site'), sitemap: 'https://peptides-three-phi.vercel.app/sitemap-index.xml' },
  { name: 'doctors', root: join(ROOT, 'sites', 'doctors'), sitemap: 'https://peptides-doctors-and-experts.vercel.app/sitemap-index.xml' },
  { name: 'content', root: join(ROOT, 'sites', 'content'), sitemap: 'https://peptides-content.vercel.app/sitemap-index.xml' },
];
const errors = [];

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
  if (!robots.includes(project.sitemap)) errors.push(`${project.name}: robots.txt has the wrong sitemap`);

  for (const file of filesUnder(dist).filter((path) => /\.(html|xml)$/i.test(path))) {
    const text = readFileSync(file, 'utf8');
    if (/_sample|example\.com/i.test(text)) errors.push(`${project.name}: sample or example content leaked into ${file}`);
    if (/—|â€”/.test(text)) errors.push(`${project.name}: em dash found in ${file}`);
    if (file.endsWith('.html')) {
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
