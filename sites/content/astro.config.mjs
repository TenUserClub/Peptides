import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://peptide-hub.vercel.app',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
