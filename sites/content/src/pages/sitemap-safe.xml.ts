import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
}[char] || char));

export async function GET() {
  const blog = (await getCollection('blog')).filter((post) => !post.id.startsWith('_sample'));
  const legal = (await getCollection('legal')).filter((post) => !post.id.startsWith('_sample'));
  const paths = [
    '/', '/about/', '/accessibility/', '/blog/', '/corrections/', '/editorial-policy/', '/faq/', '/legal/', '/privacy/', '/security/', '/terms/',
    ...blog.map((post) => `/blog/${post.id}/`),
    ...legal.map((post) => `/legal/${post.id}/`),
  ];
  const urls = paths.map((path) => `  <url><loc>${escapeXml(`https://safepeptides.us${path}`)}</loc></url>`).join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
