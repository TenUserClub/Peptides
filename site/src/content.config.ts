import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const clinics = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/clinics' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    clinicName: z.string(),
    city: z.string(),
    state: z.string(), // two-letter code
    address: z.string().optional(),
    website: z.string().url().optional(),
    phone: z.string().optional(),
    doctorName: z.string().optional(),
    services: z.array(z.string()).default([]),
    // Ratings are ALWAYS aggregated from a named public platform — never invented.
    ratingValue: z.number().min(0).max(5).optional(),
    ratingCount: z.number().int().optional(),
    ratingSource: z.string().optional(), // e.g. "Google Reviews"
    sources: z.array(z.string().url()).min(1),
    verified: z.literal(true), // publisher refuses records that didn't pass verification
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
  }),
});

const doctors = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/doctors' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    kind: z.enum(['roundup', 'profile']),
    state: z.string(), // two-letter code, same as clinics
    city: z.string().optional(),
    specialty: z.string(), // e.g. "GLP-1 therapy"
    doctorName: z.string().optional(), // profiles only
    npi: z.string().optional(),
    methodology: z.string().optional(), // REQUIRED for roundups — enforced in template
    sources: z.array(z.string().url()).min(1),
    verified: z.literal(true),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
  }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    sourceName: z.string(),
    sourceUrl: z.string().url(),
    tags: z.array(z.string()).default([]),
    publishDate: z.coerce.date(),
  }),
});

// Laws, regulation, enforcement, and legal-status explainers.
// Written by the news writer when a story is primarily legal/regulatory;
// counts toward the news velocity cap. Report accurately, never editorialize
// (CLAUDE.md rule 4); not legal advice — the legal page template says so.
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    jurisdiction: z.string().default('Federal'), // "Federal" or a two-letter state code
    sourceName: z.string(), // primary source: FDA, HHS, a state board, court filing…
    sourceUrl: z.string().url(),
    tags: z.array(z.string()).default([]),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
  }),
});

const updates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/updates' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    weekOf: z.coerce.date(),
    publishDate: z.coerce.date(),
  }),
});

export const collections = { clinics, doctors, news, legal, updates };
