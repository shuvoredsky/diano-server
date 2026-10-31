import { Router } from 'express';
import { authController } from './auth.controller';
import { authenticate, optionalAuthenticate } from '@/middlewares/auth.middleware';
import { authRateLimiter, refreshRateLimiter } from '@/middlewares/auth-rate-limiter.middleware';
import { verifyCookieOrigin } from '@/middlewares/csrf.middleware';

const authRouter = Router();

// Public Authentication Endpoints
authRouter.post('/register', authRateLimiter, authController.register);
authRouter.post('/login', authRateLimiter, authController.login);
authRouter.post('/admin/login', authRateLimiter, authController.adminLogin);

// Token Refresh & Session Termination
authRouter.post('/refresh', refreshRateLimiter, verifyCookieOrigin, authController.refresh);
authRouter.post('/logout', optionalAuthenticate, authController.logout);
authRouter.post('/logout-all', authenticate, authController.logoutAll);

// Password Recovery & Email Verification
authRouter.post('/forgot-password', authRateLimiter, authController.forgotPassword);
authRouter.post('/reset-password', authRateLimiter, authController.resetPassword);
authRouter.post('/verify-email', authController.verifyEmail);

// One-Time Password (OTP)
authRouter.post('/otp/send', authRateLimiter, authController.sendOtp);
authRouter.post('/otp/verify', authRateLimiter, authController.verifyOtp);

// Authenticated Account Management
authRouter.post('/change-password', authenticate, authController.changePassword);
authRouter.get('/me', authenticate, authController.getMe);
authRouter.patch('/me', authenticate, authController.updateMe);
authRouter.get('/login-history', authenticate, authController.getLoginHistory);

export { authRouter };
