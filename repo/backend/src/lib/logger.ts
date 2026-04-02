import winston from "winston";
import path from "path";
import { config } from "../config";

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const normalizeObjectMessage = winston.format((info) => {
  const payload = info as Record<string, unknown>;

  if (typeof payload.msg === "string" && !payload.message) {
    payload.message = payload.msg;
  }

  if (payload.message && typeof payload.message === "object") {
    const messageObj = payload.message as Record<string, unknown>;
    if (typeof messageObj.msg === "string") {
      payload.message = messageObj.msg;
      const { msg, ...rest } = messageObj;
      Object.assign(payload, rest);
    } else if (typeof messageObj.message === "string") {
      payload.message = messageObj.message;
      const { message, ...rest } = messageObj;
      Object.assign(payload, rest);
    } else {
      payload.message = JSON.stringify(messageObj);
    }
  }

  return info;
});

const devConsoleFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  normalizeObjectMessage(),
  printf((info) => {
    const {
      timestamp: ts,
      level,
      message,
      stack,
      ...meta
    } = info as Record<string, unknown>;
    const baseMessage =
      typeof stack === "string" ? stack : String(message ?? "");
    const metaKeys = Object.keys(meta).filter((k) => meta[k] !== undefined);
    const metaText = metaKeys.length > 0 ? ` ${JSON.stringify(meta)}` : "";
    return `${String(ts)} ${String(level)}: ${baseMessage}${metaText}`;
  }),
);

const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  normalizeObjectMessage(),
  json(),
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.env === "production" ? jsonFormat : devConsoleFormat,
  }),
  new winston.transports.File({
    filename: path.join(
      config.logs.path,
      `${new Date().toISOString().slice(0, 10)}.log`,
    ),
    format: jsonFormat,
    maxsize: 50 * 1024 * 1024, // 50 MB per file
  }),
];

export const logger = winston.createLogger({
  level: config.logs.level,
  transports,
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logs.path, "exceptions.log"),
      format: jsonFormat,
    }),
  ],
});
