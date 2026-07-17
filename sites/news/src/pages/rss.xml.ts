import { getCollection } from 'astro:content';

export async function GET() {
  const posts = (await getCollection('news'))
    .filter((post) => !post.id.startsWith('_sample'))
    .sort((a, b) => +b.data.publishDate - +a.data.publishDate)
    .slice(0, 50);

  const items = posts.map((post) => {
    const link = `https://peptidesnews.us/${post.id}/`;
    return `<item>
      <title>${escapeXml(post.data.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${post.data.publishDate.toUTCString()}</pubDate>
      <description>${escapeXml(post.data.description)}</description>
    </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Peptides News</title>
    <link>https://peptidesnews.us/</link>
    <description>Source-led peptide research, regulation, compounding, and industry news.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
