// Uses real browser video decoding and the actual local Tesseract worker.
// Run dev/preview first; generate fixtures with create-test-videos.mjs.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const mode = (process.env.CURBSENTRY_TEST_MODE === "dev" || process.argv.includes("--dev")) ? "dev" : "preview";
const port = mode === "dev" ? 8080 : 8081;
const base = process.env.CURBSENTRY_TEST_URL || `http://127.0.0.1:${port}/`;
let server;
if (!process.env.CURBSENTRY_TEST_URL) {
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      ...(mode === "preview" ? ["preview"] : []),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const output = resolve("test-results");
await mkdir(output, { recursive: true });
const args = ["--no-sandbox", "--disable-dev-shm-usage"];
if (process.env.CURBSENTRY_CHROMIUM_ARGS)
  args.push(...JSON.parse(process.env.CURBSENTRY_CHROMIUM_ARGS));
const browser = await chromium.launch({
  headless: true,
  args,
  ...(process.env.CURBSENTRY_CHROMIUM
    ? { executablePath: process.env.CURBSENTRY_CHROMIUM }
    : {}),
});
const errors = [];
const remote = new Set();
const checks = [];
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
context.on("request", (r) => {
  if (
    /^https?:/.test(r.url()) &&
    new URL(r.url()).origin !== new URL(base).origin
  )
    remote.add(r.url());
});
const state = () =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("curbsentry-preview-v1")).state,
  );
async function scan(name, camera = "Mailbox") {
  await page
    .getByLabel("Video file", { exact: true })
    .setInputFiles(resolve(`test-results/fixtures/${name}.mp4`));
  await page
    .getByLabel("Recording start time", { exact: true })
    .fill("2026-10-01T10:00");
  await page.getByLabel("Camera name", { exact: true }).fill(camera);
  await page.getByRole("button", { name: "Scan video", exact: true }).click();
  await page.waitForFunction(
    (name) => {
      const s = JSON.parse(
        localStorage.getItem("curbsentry-preview-v1") || "{}",
      ).state;
      return s?.scans?.[0]?.name === name && s.scans[0].status !== "scanning";
    },
    `${name}.mp4`,
    { timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Scan video", exact: true }).waitFor();
  return (await state()).scans[0];
}
try {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Use default settings", exact: true })
    .click();
  assert.equal((await state()).plates.length, 0);
  checks.push("fresh log starts empty");
  const first = await scan("plate");
  console.log("Actual OCR", JSON.stringify(first));
  assert.equal(first.status, "complete");
  assert(first.reads.some((r) => r.plate === "TEST428"));
  assert.equal(first.frames, 3);
  assert.equal(first.reads.filter((r) => r.plate === "TEST428").length, 1);
  assert.equal((await state()).plates.length, 0);
  checks.push("actual OCR automatically logs TEST428 without confirming it");
  await page.getByLabel("Plate read TEST428", { exact: true }).fill("TEST429");
  await page.getByRole("button", { name: "Confirm read", exact: true }).click();
  let saved = await state();
  assert.equal(saved.plates[0].plate, "TEST429");
  assert.equal(saved.plates[0].sightings.length, 1);
  const start = new Date("2026-10-01T10:00:00").getTime();
  assert(
    Math.abs(
      saved.plates[0].sightings[0].at -
        start -
        first.reads[0].offsetSeconds * 1000,
    ) < 1,
  );
  checks.push("correction and original capture offset saved");
  const fixture = await import("node:fs/promises").then((fs) =>
    fs.readFile(resolve("test-results/fixtures/plate.mp4")),
  );
  await page
    .getByLabel("Video file", { exact: true })
    .setInputFiles({
      name: "renamed.mp4",
      mimeType: "video/mp4",
      buffer: fixture,
    });
  await page.getByRole("button", { name: "Scan video", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "already scanned" })
    .waitFor();
  saved = await state();
  assert.equal(saved.scans.length, 1);
  assert.equal(saved.plates[0].sightings.length, 1);
  checks.push("renamed duplicate does not inflate counts");
  await page.reload();
  await page.getByRole("heading", { name: "Read a saved video" }).waitFor();
  assert.equal((await state()).plates[0].plate, "TEST429");
  checks.push("video reads and confirmed log survive reload");
  const blank = await scan("blank");
  assert.equal(blank.status, "complete");
  assert.equal(blank.reads.length, 0);
  checks.push("blank clip completes with no invented plate");
  await page
    .getByLabel("Video file", { exact: true })
    .setInputFiles(resolve("test-results/fixtures/long.mp4"));
  await page.getByRole("button", { name: "Scan video", exact: true }).click();
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("curbsentry-preview-v1")).state
      .scans[0];
    return s.name === "long.mp4" && s.frames >= 1;
  });
  await page.getByRole("button", { name: "Cancel scan", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("curbsentry-preview-v1")).state.scans[0]
        .status === "cancelled",
  );
  assert((await state()).scans[0].reads.length > 0);
  checks.push("cancel releases worker and preserves partial reads");
  await page
    .getByLabel("Video file", { exact: true })
    .setInputFiles({
      name: "broken.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("not a video"),
    });
  await page.getByRole("button", { name: "Scan video", exact: true }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("curbsentry-preview-v1")).state.scans[0]
        .status === "error",
  );
  checks.push("invalid video produces a visible error");
  await page
    .getByRole("button", { name: "Export & backup", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download log backup", exact: true })
    .click();
  const file = await download;
  await file.saveAs(resolve(output, "downloaded-log.json"));
  const backup = JSON.parse(
    await import("node:fs/promises").then((fs) =>
      fs.readFile(resolve(output, "downloaded-log.json"), "utf8"),
    ),
  );
  assert.equal(backup.data.plates[0].plate, "TEST429");
  checks.push("downloadable personal log backup");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Restore log backup")
    .setInputFiles(resolve(output, "downloaded-log.json"));
  await page
    .getByRole("status")
    .filter({ hasText: "Log backup restored" })
    .waitFor();
  checks.push("personal log backup restores");
  await page.getByRole("button", { name: "Videos", exact: true }).click();
  await page.screenshot({
    path: resolve(output, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(output, "mobile.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  checks.push("mobile layout has no horizontal overflow");
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(remote.size, 0, [...remote].join("\n"));
  checks.push("clean browser console; no remote video or OCR requests");
  const result = {
    ok: true,
    base,
    checks,
    errors,
    remoteRequests: [...remote],
    testedAt: new Date().toISOString(),
  };
  await writeFile(
    resolve(output, "browser-verification.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    "Browser failure evidence",
    JSON.stringify({
      state: await state(),
      errors,
      message: await page.locator("body").innerText(),
    }),
  );
  await page.screenshot({
    path: resolve(output, "failure.png"),
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  server?.kill("SIGTERM");
}
