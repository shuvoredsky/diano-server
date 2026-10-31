import pino from 'pino';
import type { HttpLogger } from 'pino-http';
import pinoHttp from 'pino-http';
import { env } from '@/config/env.config';

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-access-token"]',
  'req.headers["x-refresh-token"]',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'secret',
  'jwt',
  'accessToken',
  'refreshToken',
  'creditCard',
  'cardNumber',
  'cvv',
  'pin',
  '*.password',
  '*.token',
  '*.secret',
  '*.accessToken',
  '*.refreshToken',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export const httpLogger: HttpLogger = pinoHttp({
  logger,
  autoLogging: env.NODE_ENV !== 'test',
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, _res, err) => `${req.method} ${req.url} failed: ${err.message}`,
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
});
