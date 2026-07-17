import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    jurisdiction: z.string().default('Federal'),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    sourceType: z.literal('primary'),
    tags: z.array(z.string()).default([]),
    author: z.string().default('Peptide Atlas Editorial Team'),
    reviewedBy: z.string().optional(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    sources: z.array(z.string().url()).min(2),
    author: z.string().default('Peptide Atlas Editorial Team'),
    reviewedBy: z.string().optional(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { legal, blog };
