import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

loadDotEnv();

const port = readNumber("PORT", 8080);



export const config = {
  port,
  serverId: process.env.SERVER_ID ?? crypto.randomUUID(),
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: readNumber("REDIS_PORT", 6379),
    password: process.env.REDIS_PASSWORD,
    db: readNumber("REDIS_DB", 0),
  },

  checkboxes: {
    count: readNumber("CHECKBOX_COUNT", 1_000_000),
    bitmapKey: process.env.CHECKBOX_BITMAP_KEY ?? "checkboxes:bitmap:v1",
    defaultPageSize: readNumber("CHECKBOX_PAGE_SIZE", 2500),
    maxPageSize: readNumber("CHECKBOX_MAX_PAGE_SIZE", 5000),
  },
  pubSub: {
    checkboxChannel:
      process.env.CHECKBOX_PUBSUB_CHANNEL ?? "checkboxes:changes:v1",
  },
  rateLimits: {
    http: {
      limit: readNumber("HTTP_RATE_LIMIT", 120),
      windowSeconds: readNumber("HTTP_RATE_WINDOW_SECONDS", 60),
    },
    toggle: {
      limit: readNumber("TOGGLE_RATE_LIMIT", 30),
      windowSeconds: readNumber("TOGGLE_RATE_WINDOW_SECONDS", 10),
    },
    socketBurst: {
      limit: readNumber("SOCKET_BURST_LIMIT", 12),
      windowSeconds: readNumber("SOCKET_BURST_WINDOW_SECONDS", 2),
    },
  },
};

function loadDotEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function readNumber(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}


