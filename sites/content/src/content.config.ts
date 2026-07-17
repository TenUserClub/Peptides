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
    tags: z.array(z.string()).default([]),
    author: z.string().default('Peptide Atlas Editorial Team'),
    reviewedBy: z.string().optional(),
    publishDate: z.coerce.date(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

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

export const collections = { news, legal, blog, updates };
