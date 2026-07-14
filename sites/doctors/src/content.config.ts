import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const doctors = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/doctors' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    kind: z.enum(['roundup', 'profile']),
    state: z.string(),
    city: z.string().optional(),
    specialty: z.string(),
    doctorName: z.string().optional(),
    npi: z.string().optional(),
    methodology: z.string().optional(),
    sources: z.array(z.string().url()).min(1),
    verified: z.literal(true),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    image: z.string().optional(),
    ogImage: z.string().optional(),
  }),
});

export const collections = { doctors };
