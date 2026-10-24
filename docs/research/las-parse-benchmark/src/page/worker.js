// Module worker: parse a File/Blob posted from the page, send the WellLog back with its
// typed-array buffers transferred (or structured-cloned when transfer = false).
import { readLas } from '../laslib.js';

const T = () => performance.timeOrigin + performance.now();

self.onmessage = async (e) => {
  if (e.data?.type !== 'parse') return;
  const tRecvAbs = T();
  const { log, timings } = await readLas(e.data.file, e.data.opts);
  const transferList = e.data.transfer ? [log.md.buffer, ...log.curves.map((c) => c.values.buffer)] : [];
  const tSendAbs = T();
  const s0 = performance.now();
  self.postMessage({ type: 'result', log, timings, tRecvAbs, tSendAbs }, transferList);
  const sendMs = performance.now() - s0;
  self.postMessage({ type: 'sendTiming', sendMs });
};

self.postMessage({ type: 'ready' });
