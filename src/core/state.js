// src/core/state.js
// Простой in-memory стейт с TTL. На проде лучше вынести в Redis.

const mem = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 часа

export async function getSession(userId) {
  const rec = mem.get(userId);
  if (!rec) return null;
  if (Date.now() - rec.ts > TTL_MS) {
    mem.delete(userId);
    return null;
  }
  return rec.data;
}

export async function setSession(userId, data) {
  mem.set(userId, { ts: Date.now(), data });
}

export async function clearSession(userId) {
  mem.delete(userId);
}
