import express, { Application } from "express";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import { correlationIdMiddleware } from "./middleware/correlation-id.middleware";
import { requestLoggerMiddleware } from "./middleware/request-logger.middleware";
import { errorHandlerMiddleware } from "./middleware/error-handler.middleware";
import { globalRateLimiter } from "./middleware/rate-limit.middleware";
import { registerRoutes } from "./routes";

export function createApp(): Application {
  const app = express();

  // ---- Security headers ----
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Element Plus inline styles
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }),
  );

  // ---- CORS — allow all origins on closed LAN deployments ----
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  // ---- Compression ----
  app.use(compression());

  // ---- Body parsing ----
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ---- Correlation ID (before request logger) ----
  app.use(correlationIdMiddleware);

  // ---- Request logging ----
  app.use(requestLoggerMiddleware);

  // ---- Rate limiting ----
  app.use(globalRateLimiter);

  // ---- Routes ----
  registerRoutes(app);

  // ---- Global error handler (must be last) ----
  app.use(errorHandlerMiddleware);

  return app;
}
