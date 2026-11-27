/**
 * Starts the API for development, restarting it when the code in src/ changes.
 *
 * Plain `node --watch` also watches every installed library. On Windows, merely reading one of
 * those files can count as a change, so the server restarted while it was being used (and an
 * in-memory database lost its data). Watching only src/ avoids that. Node supports this on
 * Windows and macOS; elsewhere the plain watch mode is used.
 *
 * .env is read here, once, rather than with --env-file: watching that file makes Node react to
 * every change in the folder around it, including each upload. Restart after editing .env.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Variables already set in the shell win over the file, as with --env-file.
if (existsSync('.env')) process.loadEnvFile('.env');

const watch = ['win32', 'darwin'].includes(process.platform) ? '--watch-path=src' : '--watch';
const server = spawn(process.execPath, [watch, 'src/index.js'], { stdio: 'inherit' });

for (const signal of ['SIGINT', 'SIGTERM']) {
  // Stay alive while the server shuts down. A Windows terminal sends Ctrl+C to both processes
  // itself, and forwarding it there would cut the server's shutdown short.
  process.on(signal, () => {
    if (process.platform !== 'win32') server.kill(signal);
  });
}
server.on('exit', (code) => process.exit(code ?? 0));
