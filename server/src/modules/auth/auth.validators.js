import { z } from 'zod';
import { THEMES } from '../../models/User.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address').max(254));

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Tell us your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  theme: z.enum(THEMES).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
