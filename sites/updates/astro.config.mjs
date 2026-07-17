import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://peptidesupdates.com',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
