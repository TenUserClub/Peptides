import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const [news, blog, legal] = await Promise.all([
    getCollection('news'),
    getCollection('blog'),
    getCollection('legal'),
  ]);

  const all = [...news, ...blog, ...legal]
    .filter((p) => !p.id.startsWith('_sample'))
    .sort((a, b) => +b.data.publishDate - +a.data.publishDate)
    .slice(0, 50);

  const site = (context.site ?? 'https://peptide-hub.vercel.app').toString().replace(/\/$/, '');

  const items = all.map((post) => {
    const collection = post.collection;
    const link = `${site}/${collection}/${post.id}/`;
    const pubDate = post.data.publishDate.toUTCString();
    return `
    <item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
    </item>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Peptide Hub — News &amp; Guides</title>
    <link>${site}/</link>
    <description>Verified peptide therapy clinics, doctor listings, educational guides, and daily industry news.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml.trim(), {
    headers: { 'Content-Type': 'application/xml' },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
