import { z } from 'zod';
import mongoose from 'mongoose';
import { passwordSchema } from '../auth/auth.validators.js';
import { ANSWER_MODES, LIBRARY_SORTS, LIBRARY_VIEWS, RESPONSE_STYLES, THEMES } from '../../models/User.js';

const interestsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(12, 'Choose up to 12 topics')
  .transform((arr) => [...new Map(arr.map((t) => [t.toLowerCase(), t])).values()]);

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(80).optional(),
    bio: z.string().trim().max(280, 'Keep your bio under 280 characters').optional(),
    interests: interestsSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const updatePreferencesSchema = z
  .object({
    theme: z.enum(THEMES).optional(),
    reduceMotion: z.boolean().optional(),
    ai: z
      .object({
        defaultMode: z.enum(ANSWER_MODES).optional(),
        responseStyle: z.enum(RESPONSE_STYLES).optional(),
        showFollowUps: z.boolean().optional(),
      })
      .strict()
      .optional(),
    library: z
      .object({
        defaultSort: z.enum(LIBRARY_SORTS).optional(),
        defaultView: z.enum(LIBRARY_VIEWS).optional(),
        autoProcessUploads: z.boolean().optional(),
        suggestConnections: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    theme: z.enum(THEMES),
    interests: interestsSchema.default([]),
    defaultMode: z.enum(ANSWER_MODES).default('general'),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password you are not already using',
    path: ['newPassword'],
  });

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm').max(128),
  confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }),
});

export const sessionIdParams = z.object({
  id: z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid session id'),
});
