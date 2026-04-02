import winston from 'winston';
import path from 'path';
import { config } from '../config';

const { combine, timestamp, json, colorize, simple } = winston.format;

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.env === 'production'
      ? combine(timestamp(), json())
      : combine(colorize(), simple()),
  }),
  new winston.transports.File({
    filename: path.join(config.logs.path, `${new Date().toISOString().slice(0, 10)}.log`),
    format: combine(timestamp(), json()),
    maxsize: 50 * 1024 * 1024, // 50 MB per file
  }),
];

export const logger = winston.createLogger({
  level: config.logs.level,
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logs.path, 'exceptions.log'),
      format: combine(timestamp(), json()),
    }),
  ],
});
