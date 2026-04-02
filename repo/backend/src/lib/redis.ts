import Redis from "ioredis";
import { config } from "../config";
import { logger } from "./logger";

let client: Redis;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(config.redis.url, {
      // BullMQ requires null here for worker/queue connections.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    client.on("connect", () => logger.info({ msg: "Redis connected" }));
    client.on("error", (err) => logger.error({ msg: "Redis error", err }));
    client.on("reconnecting", () =>
      logger.warn({ msg: "Redis reconnecting..." }),
    );
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const c = getRedisClient();
  await c.ping();
  logger.info({ msg: "Redis ready" });
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    logger.info({ msg: "Redis disconnected" });
  }
}
