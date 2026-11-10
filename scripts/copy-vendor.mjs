// Copies ffmpeg.wasm from node_modules into public/vendor so the site serves it
// from its own domain (keeps the Content-Security-Policy strict).
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const jobs = [
  ['node_modules/@ffmpeg/ffmpeg/dist/umd', 'public/vendor/ffmpeg'],
  ['node_modules/@ffmpeg/core/dist/umd', 'public/vendor/core'],
  ['node_modules/@ffmpeg/util/dist/umd', 'public/vendor/util'],
];

rmSync('public/vendor', { recursive: true, force: true });
for (const [from, to] of jobs) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true, filter: (src) => !src.endsWith('.map') });
}
console.log('ffmpeg.wasm copied to public/vendor');
