// worker.js
import { parentPort } from 'worker_threads';

// Worker listens for tasks: { taskId, durationMs, quantumMs, mode }
// mode: "full" (work completed in one go) or "quantum" (work for quantum then return remaining)

parentPort?.on('message', async (msg) => {
  const { taskId, workMs, quantumMs } = msg;
  // simulate work by sleeping for requested ms
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // If quantum provided, we do only min(workMs, quantumMs)
  const execMs = (typeof quantumMs === 'number') ? Math.min(workMs, quantumMs) : workMs;
  const start = Date.now();
  await sleep(execMs);
  const actual = Date.now() - start;

  // reply with how much work we consumed
  parentPort.postMessage({ taskId, consumedMs: actual });
});

