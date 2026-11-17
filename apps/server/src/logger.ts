import pino from 'pino';
import { env, isProduction, isTest } from './env.js';

/**
 * Structured application logger.
 * Pretty output in development, newline-delimited JSON in production so that
 * logs can be shipped/rotated by the installer. Silent during unit tests.
 */
// pino-pretty is a devDependency and is not installed in the Vercel function.
const prettyTransport = !isProduction && !process.env.VERCEL;

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'password', '*.password', '*.passwordHash', '*.token'],
    censor: '[redacted]',
  },
  transport: prettyTransport
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      }
    : undefined,
});

export type Logger = typeof logger;
