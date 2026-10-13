// One line per completed request: method, path, status, duration.
//
// Kept deliberately tiny (no logging library). Every line lands in
// logs/access.log; the console copy stays quiet during tests so the node:test
// reporter stays readable (NODE_TEST_CONTEXT is set by node's test runner in
// its worker processes, so `npm test` output stays readable without touching
// package.json scripts). 5xx responses are also written to app.log and
// error.log as errors — those are the lines you want when something breaks.

import { logger } from '../utils/logger.js';

const quiet =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.env.NODE_ENV === 'test' ||
  process.env.LOG_REQUESTS === 'off';

export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    logger.access(line);
    if (res.statusCode >= 500) {
      // file: access.log + app.log + error.log; console: stderr (quiet in tests)
      logger.error(`${line} user=${req.user?.id ?? 'anon'}`);
    } else if (!quiet) {
      console.log(line);
    }
  });
  next();
};
