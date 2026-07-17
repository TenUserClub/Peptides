import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const updates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/updates' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    weekOf: z.coerce.date(),
    publishDate: z.coerce.date(),
    author: z.string().default('Peptide Atlas Editorial Team'),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { updates };
