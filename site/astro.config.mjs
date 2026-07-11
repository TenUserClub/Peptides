import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Using free Vercel Hobby domain. Update if you add a custom domain later.
export default defineConfig({
  site: 'https://peptide-seo-site.vercel.app',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
