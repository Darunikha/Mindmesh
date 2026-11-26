import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter, forgotPasswordLimiter, resetPasswordLimiter } from '../../middleware/rateLimit.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.validators.js';
import * as ctrl from './auth.controller.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), ctrl.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
router.post('/forgot-password', forgotPasswordLimiter, validate({ body: forgotPasswordSchema }), ctrl.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, validate({ body: resetPasswordSchema }), ctrl.resetPassword);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/logout-all', requireAuth, ctrl.logoutAll);

export default router;
