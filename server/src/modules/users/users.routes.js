import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import * as v from './users.validators.js';
import * as ctrl from './users.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/me', ctrl.getMe);
router.patch('/me', validate({ body: v.updateProfileSchema }), ctrl.updateMe);
router.patch('/me/preferences', validate({ body: v.updatePreferencesSchema }), ctrl.updatePreferences);
router.post('/me/onboarding', validate({ body: v.onboardingSchema }), ctrl.completeOnboarding);
router.post('/me/password', sensitiveLimiter, validate({ body: v.changePasswordSchema }), ctrl.changePassword);
router.get('/me/sessions', ctrl.listSessions);
router.delete('/me/sessions/:id', validate({ params: v.sessionIdParams }), ctrl.revokeSession);
router.delete('/me', sensitiveLimiter, validate({ body: v.deleteAccountSchema }), ctrl.deleteMe);

export default router;
