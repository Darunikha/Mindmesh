import env from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { createApp } from './app.js';
import { ensureStorage } from './processing/storage.js';
import { recoverStuckJobs } from './processing/processor.js';
import { waitForIdle } from './processing/queue.js';

async function main() {
  await connectDatabase();
  await ensureStorage();
  await recoverStuckJobs();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[mindmesh] API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal) => {
    console.log(`[mindmesh] ${signal} received, shutting down...`);
    server.close();
    // Give in-flight processing jobs a moment to finish; unfinished ones are re-queued at next boot.
    await Promise.race([waitForIdle(), new Promise((r) => setTimeout(r, 5000))]);
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[mindmesh] Failed to start:', err.message);
  process.exit(1);
});
