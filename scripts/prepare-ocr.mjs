// Copy only the installed, pinned OCR runtime. Language data is already local.
import { mkdir, readdir, copyFile, rm, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const core = dirname(require.resolve("tesseract.js-core/package.json"));
const api = dirname(require.resolve("tesseract.js/package.json"));
const output = new URL("../public/ocr/runtime/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(
  join(api, "dist/worker.min.js"),
  new URL("worker.min.js", output),
);
for (const name of await readdir(core)) {
  // createWorker uses LSTM-only mode. Keep ordinary/SIMD/relaxed-SIMD choices.
  if (/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(name))
    await copyFile(join(core, name), new URL(name, output));
}
await copyFile(
  new URL("../licenses/Apache-2.0.txt", import.meta.url),
  new URL("LICENSE.txt", output),
);
console.log("Local OCR runtime prepared.");
const notices = new URL("../public/licenses/", import.meta.url);
await rm(notices, { recursive: true, force: true });
await cp(new URL("../licenses/", import.meta.url), notices, { recursive: true });
