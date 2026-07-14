import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://peptides-content.vercel.app',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
