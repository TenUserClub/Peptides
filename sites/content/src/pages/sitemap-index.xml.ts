const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://safepeptides.us/sitemap-safe.xml</loc></sitemap>
</sitemapindex>`;

export const GET = () => new Response(xml, {
  headers: { 'Content-Type': 'application/xml; charset=utf-8' },
});
