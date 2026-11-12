import env from '../config/env.js';

/**
 * In-process background job queue for resource processing.
 *
 * Jobs run outside the request cycle (uploads return immediately with status "pending")
 * with bounded concurrency. Durable state lives in MongoDB (processing.status), so jobs
 * interrupted by a restart are re-queued at boot by recoverStuckJobs().
 * For multi-instance deployments this can be replaced by a shared queue (e.g. BullMQ)
 * without changing callers: they only call enqueue(resourceId).
 */
let handler = null;
const waiting = [];
const queued = new Set();
let active = 0;
let idleResolvers = [];

export function setJobHandler(fn) {
  handler = fn;
}

export function enqueue(resourceId) {
  const id = String(resourceId);
  if (queued.has(id)) return;
  queued.add(id);
  waiting.push(id);
  setImmediate(drain);
}

function drain() {
  while (handler && active < env.PROCESSING_CONCURRENCY && waiting.length) {
    const id = waiting.shift();
    active += 1;
    Promise.resolve()
      .then(() => handler(id))
      .catch((err) => console.error(`[mindmesh] Processing job ${id} crashed:`, err))
      .finally(() => {
        active -= 1;
        queued.delete(id);
        if (active === 0 && waiting.length === 0) {
          idleResolvers.forEach((r) => r());
          idleResolvers = [];
        }
        drain();
      });
  }
}

/** Resolves when no jobs are running or waiting (used by tests and graceful shutdown). */
export function waitForIdle() {
  if (active === 0 && waiting.length === 0) return Promise.resolve();
  return new Promise((resolve) => idleResolvers.push(resolve));
}

export function queueStats() {
  return { active, waiting: waiting.length };
}
