import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export async function GET({ site }: { site?: URL }) {
  const base = (site?.toString() || 'https://safepeptides.us/').replace(/\/$/, '');
  const posts = (await getCollection('blog'))
    .filter((post) => !post.id.startsWith('_sample'))
    .sort((a, b) => +b.data.publishDate - +a.data.publishDate);
  const items = posts.map((post) => {
    const link = `${base}/blog/${post.id}/`;
    return `<item><title>${escapeXml(post.data.title)}</title><description>${escapeXml(post.data.description)}</description><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${post.data.publishDate.toUTCString()}</pubDate></item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Safe Peptides blog</title><link>${base}/blog/</link><description>Evidence-led peptide guides, comparisons, and safety resources.</description><language>en-us</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
