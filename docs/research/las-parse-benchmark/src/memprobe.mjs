// node --expose-gc memprobe.mjs FILE  -- heap vs external at each phase, and what retains the text
import fs from 'node:fs';
import { decodeLas, parseLas, buildWellLog } from './laslib.js';
const m = (label) => { gc(); gc(); const u = process.memoryUsage(); console.log(label.padEnd(22), 'heapUsed', (u.heapUsed/1e6).toFixed(0), 'external', (u.external/1e6).toFixed(0), 'arrayBuffers', (u.arrayBuffers/1e6).toFixed(0)); };
const blob = await fs.openAsBlob(process.argv[2]);
m('base');
let buf = await blob.arrayBuffer(); m('after arrayBuffer');
let bytes = new Uint8Array(buf);
let { text } = decodeLas(bytes); m('after decode');
let doc = parseLas(text, { tokenizer: process.argv[3] ?? 'scan' }); m('after parse');
const log = buildWellLog(doc, 'x'); m('after build');
buf = bytes = null; m('drop bytes');
doc = null; m('drop doc');
text = null; m('drop text');
/x/.exec('reset legacy RegExp statics'); m('after RegExp reset');
console.log(log.md.length);
