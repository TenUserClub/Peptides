import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const clinics = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/clinics' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    clinicName: z.string(),
    city: z.string(),
    state: z.string(),
    address: z.string().optional(),
    website: z.string().url().optional(),
    phone: z.string().optional(),
    doctorName: z.string().optional(),
    services: z.array(z.string()).default([]),
    ratingValue: z.number().min(0).max(5).optional(),
    ratingCount: z.number().int().optional(),
    ratingSource: z.string().optional(),
    sources: z.array(z.string().url()).min(1),
    verified: z.literal(true),
    author: z.string().default('Peptide Atlas Editorial Team'),
    reviewedBy: z.string().optional(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { clinics };
