/**
 * In-process background job queues.
 *
 * Jobs run outside the request cycle with bounded concurrency. Durable state lives in
 * MongoDB (processing.status / embedding.status), so work interrupted by a restart is
 * re-queued at boot. For multi-instance deployments these can be swapped for a shared
 * queue (e.g. BullMQ) without changing callers: they only call `enqueue(id)`.
 */
const queues = new Set();

export function createQueue({ name, concurrency = 2 }) {
  let handler = null;
  const waiting = [];
  const queued = new Set();
  const timers = new Map();
  let active = 0;

  const q = {
    name,
    setHandler(fn) {
      handler = fn;
      setImmediate(drain);
    },
    /** Adds a job. With `delay`, the job is (re)scheduled, so rapid repeats coalesce into one run. */
    enqueue(id, { delay = 0 } = {}) {
      const key = String(id);
      if (delay > 0) {
        clearTimeout(timers.get(key));
        timers.set(
          key,
          setTimeout(() => {
            timers.delete(key);
            q.enqueue(key);
          }, delay)
        );
        return;
      }
      if (queued.has(key)) return;
      queued.add(key);
      waiting.push(key);
      setImmediate(drain);
    },
    isIdle: () => active === 0 && waiting.length === 0 && timers.size === 0,
    stats: () => ({ active, waiting: waiting.length, scheduled: timers.size }),
    /** Runs scheduled (delayed) jobs now. Used by tests and shutdown. */
    flushScheduled() {
      for (const [key, t] of timers) {
        clearTimeout(t);
        timers.delete(key);
        q.enqueue(key);
      }
    },
  };

  function drain() {
    while (handler && active < concurrency && waiting.length) {
      const id = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(() => handler(id))
        .catch((err) => console.error(`[mindmesh] ${name} job ${id} crashed:`, err))
        .finally(() => {
          active -= 1;
          queued.delete(id);
          drain();
        });
    }
  }

  queues.add(q);
  return q;
}

/** Resolves when every queue is idle (used by tests and graceful shutdown). */
export async function waitForIdle({ flushScheduled = true } = {}) {
  for (;;) {
    if (flushScheduled) queues.forEach((q) => q.flushScheduled());
    if ([...queues].every((q) => q.isIdle())) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

export function queueStats() {
  return Object.fromEntries([...queues].map((q) => [q.name, q.stats()]));
}
