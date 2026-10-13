// Dependency-free file logger — the project deliberately avoids logging
// libraries (same reasoning as requestLogger.js).
//
// Writes into <server>/logs/ (the folder is created on first use):
//   app.log    every level (debug only when LOG_LEVEL=debug)
//   error.log  errors only
//   access.log one line per completed HTTP request
//
// Files are always written; the console mirror stays on except under the test
// runner (NODE_TEST_CONTEXT / NODE_ENV=test) or when LOG_CONSOLE=off, so
// `npm test` output stays readable while the files still record everything.
// A logging failure must never take down a request: every write is guarded
// and falls back to stderr.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/utils -> server -> logs
export const logsDir = path.resolve(__dirname, '..', '..', 'logs');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const consoleQuiet =
  process.env.NODE_TEST_CONTEXT !== undefined ||
  process.env.NODE_ENV === 'test' ||
  process.env.LOG_CONSOLE === 'off';

// Small files with one rotated copy kept (app.log -> app.log.1) so a
// long-lived process can never fill the disk.
const MAX_BYTES = 1024 * 1024;

const append = (fileName, line) => {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    const full = path.join(logsDir, fileName);
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      // file does not exist yet
    }
    if (size >= MAX_BYTES) {
      fs.renameSync(full, `${full}.1`); // replaces the previous backup
    }
    // appendFileSync: the line is on disk even if the process dies right after
    fs.appendFileSync(full, `${line}\n`);
    return true;
  } catch (err) {
    console.error(`[logger] could not write ${fileName}: ${err.message}`);
    return false;
  }
};

const formatMeta = (meta) => {
  if (meta === undefined || meta === null) return '';
  if (meta instanceof Error) {
    const stack = (meta.stack || `${meta.name}: ${meta.message}`).replace(/\s*\n\s*/g, ' | ');
    return ` ${stack}`;
  }
  if (typeof meta === 'string') return ` ${meta}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
};

const write = (level, message, meta) => {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${formatMeta(meta)}`;
  append('app.log', line);
  if (level === 'error') append('error.log', line);
  if (!consoleQuiet) {
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  }
};

export const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),

  // One line per completed HTTP request. File-only on purpose: requestLogger
  // owns the terminal output for requests so test reports stay readable.
  access: (line) => {
    append('access.log', `${new Date().toISOString()} ${line}`);
  }
};

export default logger;
