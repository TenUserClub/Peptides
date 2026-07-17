import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://toppeptideslist.com',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
