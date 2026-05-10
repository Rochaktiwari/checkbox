import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";

import { config } from "./src/config.js";
import {
  getCheckboxRange,
  isValidCheckboxIndex,
  setCheckboxState,
} from "./src/checkboxStore.js";
import { subscriber, publisher, redis } from "./src/redis.js";
import { checkRateLimit, httpRateLimit } from "./src/rateLimit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    serverId: config.serverId,
    checkboxCount: config.checkboxes.count,
  });
});

app.use(
  "/api",
  httpRateLimit({
    namespace: "http-api",
    limit: config.rateLimits.http.limit,
    windowSeconds: config.rateLimits.http.windowSeconds,
  }),
);

app.get("/api/me", (req, res) => {
  res.json({
    authenticated: true,
    user: { id: "guest", name: "Guest" },
  });
});

app.get("/api/checkboxes", async (req, res, next) => {
  try {
    const start = Number.parseInt(req.query.start ?? "0", 10);
    const limit = Number.parseInt(
      req.query.limit ?? `${config.checkboxes.defaultPageSize}`,
      10,
    );
    res.json(await getCheckboxRange(start, limit));
  } catch (error) {
    next(error);
  }
});

app.post("/api/checkboxes/:index", async (req, res, next) => {
  try {
    const index = Number.parseInt(req.params.index, 10);
    const checked = Boolean(req.body?.checked);
    if (!isValidCheckboxIndex(index)) {
      return res.status(400).json({ error: "Invalid checkbox index." });
    }

    const limit = await checkRateLimit({
      namespace: "http-toggle",
      identifier: "guest",
      limit: config.rateLimits.toggle.limit,
      windowSeconds: config.rateLimits.toggle.windowSeconds,
    });

    if (!limit.allowed) {
      return res.status(429).json({
        error: "Too many checkbox updates. Please slow down.",
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const update = await persistAndPublishCheckboxChange({
      index,
      checked,
      sourceSocketId: null,
    });
    
    // Immediate local broadcast
    io.emit("server:checkbox:change", update);
    
    res.json(update);
  } catch (error) {
    next(error);
  }
});

app.get("/checkboxes", async (req, res, next) => {
  try {
    res.json(await getCheckboxRange(0, config.checkboxes.defaultPageSize));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(__dirname, "public")));

await subscriber.subscribe(config.pubSub.checkboxChannel);
subscriber.on("message", (channel, message) => {
  if (channel !== config.pubSub.checkboxChannel) return;

  try {
    const event = JSON.parse(message);
    
    // Only broadcast if it didn't originate from this instance's socket handler
    // (which already did a local broadcast for speed)
    if (event.serverId !== config.serverId) {
      io.emit("server:checkbox:change", event);
    }
  } catch (error) {
    console.error("Failed to handle Redis Pub/Sub message", error);
  }
});

io.on("connection", (socket) => {
  socket.emit("server:auth", {
    authenticated: true,
    user: { id: "guest", name: "Guest" },
    socketId: socket.id,
  });
  broadcastPresence();

  socket.on("client:checkbox:change", async (data) => {
    console.log(`[Socket] Received toggle request for index ${data?.index} (checked: ${data?.checked})`);
    try {
      const index = Number.parseInt(data?.index, 10);
      const checked = Boolean(data?.checked);
      if (!isValidCheckboxIndex(index)) {
        console.warn(`[Socket] Invalid index: ${index}`);
        socket.emit("server:error", { error: "Invalid checkbox index." });
        return;
      }

      const socketLimit = await checkRateLimit({
        namespace: "ws-toggle-socket",
        identifier: socket.id,
        limit: config.rateLimits.socketBurst.limit,
        windowSeconds: config.rateLimits.socketBurst.windowSeconds,
      });

      if (!socketLimit.allowed) {
        console.warn(`[Socket] Rate limit hit for ${socket.id}`);
        socket.emit("server:error", {
          error: "Too many updates. Slow down!",
          retryAfterSeconds: socketLimit.retryAfterSeconds,
        });
        return;
      }

      const update = await persistAndPublishCheckboxChange({
        index,
        checked,
        sourceSocketId: socket.id,
      });

      console.log(`[Socket] Broadcasting update for ${index} to all clients`);
      io.emit("server:checkbox:change", update);
    } catch (error) {
      console.error("[Socket] Error processing toggle:", error);
      socket.emit("server:error", { error: `Server error: ${error.message}` });
    }
  });

  socket.on("disconnect", () => {
    broadcastPresence();
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.statusCode ?? 500).json({
    error: error.publicMessage ?? "Something went wrong.",
    detail:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message ?? String(error),
  });
});

server.listen(config.port, () => {
  console.log(`Server ${config.serverId} listening on http://localhost:${config.port}`);
});

async function persistAndPublishCheckboxChange({
  index,
  checked,
  sourceSocketId,
}) {
  const result = await setCheckboxState(index, checked);
  
  // Fetch total count in parallel or safely to not block the broadcast
  let totalChecked;
  try {
    totalChecked = await redis.bitcount(config.checkboxes.bitmapKey);
  } catch (err) {
    console.error("Failed to count bits", err);
  }
  
  const event = {
    index,
    checked,
    previous: result.previous,
    changed: result.changed,
    totalChecked,
    changedBy: { id: "guest", name: "Guest" },
    sourceSocketId,
    serverId: config.serverId,
    at: new Date().toISOString(),
  };

  await publisher.publish(config.pubSub.checkboxChannel, JSON.stringify(event));
  return event;
}

function broadcastPresence() {
  io.emit("server:presence", {
    sockets: io.engine.clientsCount,
  });
}

