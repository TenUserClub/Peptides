import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://peptidesnews.us',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
