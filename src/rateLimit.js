import crypto from "node:crypto";
import { redis } from "./redis.js";

export async function checkRateLimit({
  namespace,
  identifier,
  limit,
  windowSeconds,
}) {
  const safeIdentifier = hashIdentifier(identifier);
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = `rate:${namespace}:${safeIdentifier}:${windowId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds + 2);
  }

  const elapsedSeconds = Math.floor(Date.now() / 1000) % windowSeconds;
  const retryAfterSeconds = Math.max(1, windowSeconds - elapsedSeconds);

  return {
    allowed: count <= limit,
    count,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

export function httpRateLimit({ namespace, limit, windowSeconds }) {
  return async (req, res, next) => {
    try {
      const identity = req.user?.id ?? getRequestIp(req);
      const result = await checkRateLimit({
        namespace,
        identifier: identity,
        limit,
        windowSeconds,
      });

      res.setHeader("RateLimit-Limit", limit);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader("RateLimit-Reset", result.retryAfterSeconds);

      if (!result.allowed) {
        return res.status(429).json({
          error: "Too many requests. Please slow down.",
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function getRequestIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function hashIdentifier(identifier) {
  return crypto
    .createHash("sha256")
    .update(String(identifier ?? "anonymous"))
    .digest("hex")
    .slice(0, 32);
}
