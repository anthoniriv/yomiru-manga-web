import { z } from 'zod';

export const saveBookSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  source_url: z.string().url('Invalid URL'),
  cover_image_url: z.string().url().nullable(),
  rating: z.number().min(0).max(10).nullable(),
  description: z.string().nullable(),
  source_domain: z.string().min(1),
  status: z.enum(['reading', 'completed', 'dropped', 'plan_to_read']),
  chapters: z.array(z.object({
    title: z.string(),
    number: z.number(),
    url: z.string().url(),
    season_name: z.string().optional(),
    season_number: z.number().optional(),
  })),
});

export type SaveBookInput = z.infer<typeof saveBookSchema>;
