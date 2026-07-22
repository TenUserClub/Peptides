import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    sourceType: z.literal('primary'),
    sourceClass: z.enum(['government', 'international-regulator', 'court', 'trial-registry', 'research', 'company']),
    sourcePublishedDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    author: z.string().default('Peptide Atlas Editorial Team'),
    reviewedBy: z.string().optional(),
    publishDate: z.coerce.date(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { news };
