// Does Emulation.setCPUThrottlingRate work on a dedicated-worker CDP target?
// Launches chrome-headless-shell with --remote-debugging-port and talks raw CDP (flatten mode).
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { startServer } from './server.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const exe = path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell');
const file = process.argv[3];
const srv = await startServer({ '/src/': here, '/f/': path.dirname(path.resolve(file)) });
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 100));
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else listeners.forEach((l) => l(m));
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });

const throttleWorker = Number(process.argv[2] ?? 4);
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
listeners.push(async (m) => {
  if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'worker') {
    const ws2 = m.params.sessionId;
    try {
      if (throttleWorker > 1) await send('Emulation.setCPUThrottlingRate', { rate: throttleWorker }, ws2);
      console.log('worker throttled at', throttleWorker);
    } catch (e) {
      console.log('worker throttle failed:', e.message);
    }
    await send('Runtime.runIfWaitingForDebugger', {}, ws2);
  }
});
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
await send('Page.enable', {}, sessionId);
await send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/src/page/index.html` }, sessionId);
await new Promise((r) => setTimeout(r, 1500));
const expr = `window.benchWorker(${JSON.stringify('/f/' + path.basename(file))}, {tokenizer:'scan',storage:'array'}, 3, true)`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
console.log(JSON.stringify(r.result.value?.map((x) => ({ spawn: x.spawn, wsync: x.worker.sync, total: x.total })) ?? r));
chrome.kill();
srv.close();
process.exit(0);
