import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO: Update with your actual Vercel domain after first deploy
// e.g. 'https://peptide-seo-site.vercel.app' or your custom domain
export default defineConfig({
  site: 'https://peptide-seo-site.vercel.app',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
