import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// TODO(user): replace with your real domain once purchased
export default defineConfig({
  site: 'https://YOUR-DOMAIN.com',
  integrations: [sitemap()],
  trailingSlash: 'always',
});
