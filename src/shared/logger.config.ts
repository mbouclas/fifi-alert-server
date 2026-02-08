import {
  utilities as nestWinstonModuleUtilities,
  WinstonModuleOptions,
} from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Determine log level based on NODE_ENV
const getLogLevel = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL;

  if (logLevel) {
    return logLevel;
  }

  switch (env) {
    case 'production':
      return 'info';
    case 'staging':
      return 'info';
    case 'test':
      return 'error';
    default:
      return 'debug';
  }
};

// Custom format for structured logging
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['timestamp', 'level', 'message'] }),
  winston.format.json(),
);

// Custom format for console (development)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.ms(),
  nestWinstonModuleUtilities.format.nestLike('FiFiAlert', {
    colors: true,
    prettyPrint: true,
  }),
);

export const loggerConfig: WinstonModuleOptions = {
  level: getLogLevel(),
  transports: [
    // Console transport (development-friendly)
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? structuredFormat
          : consoleFormat,
    }),
    // Application logs (all levels)
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: structuredFormat,
    }),
    // Error logs (separate file for easier troubleshooting)
    new winston.transports.DailyRotateFile({
      level: 'error',
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d', // Keep error logs longer
      format: structuredFormat,
    }),
    // Alert-specific events log (for analytics and debugging)
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'events-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '50m',
      maxFiles: '30d',
      format: structuredFormat,
      level: 'info',
    }),
  ],
};

/**
 * Helper function to sanitize log data - removes PII
 * NEVER log: names, emails, phone numbers, exact GPS coordinates
 */
export const sanitizeLogData = (data: any): any => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = { ...data };
  const piiFields = [
    'email',
    'phone',
    'name',
    'full_name',
    'address',
    'password',
    'token',
    'push_token',
  ];

  for (const field of piiFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Redact exact GPS coordinates (keep approximate location only)
  if (sanitized.latitude || sanitized.lat) {
    sanitized.latitude = sanitized.latitude
      ? parseFloat(sanitized.latitude.toFixed(2))
      : undefined;
    sanitized.lat = sanitized.lat
      ? parseFloat(sanitized.lat.toFixed(2))
      : undefined;
  }
  if (sanitized.longitude || sanitized.lon) {
    sanitized.longitude = sanitized.longitude
      ? parseFloat(sanitized.longitude.toFixed(2))
      : undefined;
    sanitized.lon = sanitized.lon
      ? parseFloat(sanitized.lon.toFixed(2))
      : undefined;
  }

  return sanitized;
};
