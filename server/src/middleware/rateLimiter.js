import rateLimit from 'express-rate-limit';

// Blocks brute-force login attempts: 20 per 15 minutes per IP
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many login attempts, please try again after 15 minutes' }
});

// General API budget for every /api route. Deliberately generous: it exists
// to stop runaway loops and scripted scraping, not to interrupt real users
// or the test suites (which fire a few hundred requests per run).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many requests, please try again later' }
});

// Password reset codes are a brute-force target (6 digits): 10 tries per
// 15 minutes per IP makes guessing one useless while an honest user
// mistyping a code a few times never notices.
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Too many password reset attempts, please try again after 15 minutes' }
});
