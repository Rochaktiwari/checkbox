import { config } from "./config.js";
import { redis } from "./redis.js";

export function isValidCheckboxIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < config.checkboxes.count;
}

export async function getCheckboxRange(startInput, limitInput) {
  const start = clampNumber(startInput, 0, config.checkboxes.count - 1, 0);
  const limit = clampNumber(
    limitInput,
    1,
    config.checkboxes.maxPageSize,
    config.checkboxes.defaultPageSize,
  );
  const endExclusive = Math.min(start + limit, config.checkboxes.count);
  const pipeline = redis.pipeline();

  for (let index = start; index < endExclusive; index += 1) {
    pipeline.getbit(config.checkboxes.bitmapKey, index);
  }

  const [responses, checkedCount] = await Promise.all([
    pipeline.exec(),
    redis.bitcount(config.checkboxes.bitmapKey),
  ]);

  const checkboxes = responses.map(([error, value]) => {
    if (error) throw error;
    return value === 1;
  });

  return {
    start,
    limit: checkboxes.length,
    total: config.checkboxes.count,
    checkedCount,
    checkboxes,
  };
}

export async function setCheckboxState(index, checked) {
  if (!isValidCheckboxIndex(index)) {
    const error = new Error("Invalid checkbox index.");
    error.statusCode = 400;
    error.publicMessage = "Invalid checkbox index.";
    throw error;
  }

  const value = checked ? 1 : 0;
  const previous = await redis.setbit(config.checkboxes.bitmapKey, index, value);

  return {
    previous: previous === 1,
    changed: previous !== value,
  };
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
