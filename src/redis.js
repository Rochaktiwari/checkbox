import Redis from "ioredis";
import { config } from "./config.js";

function connectToRedis() {
  if (config.redis.url) return new Redis(config.redis.url);

  return new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
  });
}

export const redis = connectToRedis();
export const publisher = connectToRedis();
export const subscriber = connectToRedis();
