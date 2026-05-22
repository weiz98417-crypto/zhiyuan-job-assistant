// @ts-check
/**
 * server.mjs — Custom Next.js entry point for Railway
 *
 * Runs Next.js + scan-worker in a single process group.
 * Worker is forked as a child process with auto-restart.
 */

import { createServer } from 'http';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
const WORKER_PATH = path.join(__dirname, 'scripts', 'scan-worker.mjs');

// ── Fork worker ────────────────────────────────────────────────────

let restartCount = 0;
let restartWindowStart = Date.now();

function startWorker() {
  const worker = fork(WORKER_PATH, [], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: process.env.DATA_DIR || path.join(__dirname, 'data') },
    silent: false,
    stdio: 'inherit',
  });

  worker.on('exit', (code) => {
    const now = Date.now();
    if (now - restartWindowStart > 60_000) {
      restartCount = 0;
      restartWindowStart = now;
    }
    restartCount++;

    if (restartCount > 5) {
      console.error(`[server] Worker crashed ${restartCount} times in 60s — circuit breaker tripped. NOT restarting.`);
      return;
    }

    const delay = Math.min(5000 * Math.pow(2, restartCount - 1), 60000);
    console.error(`[server] Worker exited with code ${code}, restarting in ${delay / 1000}s... (attempt ${restartCount}/5)`);
    setTimeout(() => { currentWorker = startWorker(); }, delay);
  });

    console.log(`[server] Worker started (PID: ${worker.pid})`);
  return worker;
}

let currentWorker = null;

// ── Graceful shutdown ──────────────────────────────────────────

function shutdown(signal) {
  console.log(`[server] Received ${signal}, shutting down gracefully...`);
  if (currentWorker) {
    currentWorker.kill('SIGTERM');
    // Give worker 5s to finish, then force kill
    setTimeout(() => {
      if (currentWorker && !currentWorker.killed) {
        console.log('[server] Worker did not exit, force killing...');
        currentWorker.kill('SIGKILL');
      }
    }, 5000);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Start Next.js ──────────────────────────────────────────────────

async function main() {
  // Dynamic import because next is not ESM-native
  const next = (await import('next')).default;
  const app = next({ dev: false, dir: __dirname });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Start worker
  currentWorker = startWorker();

  // Start HTTP server
  createServer(handle).listen(PORT, () => {
    console.log(`[server] Next.js ready on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('[server] Fatal:', err);
  process.exit(1);
});
