import { mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const folder = new URL("../test-results/fixtures/", import.meta.url);
await mkdir(folder, { recursive: true });
for (const [name, text, seconds] of [
  ["plate", "TEST428", 3],
  ["blank", "", 2],
  ["long", "TEST429", 30],
]) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=white:s=1280x720:d=${seconds}:r=10`,
  ];
  if (text)
    args.push(
      "-vf",
      `drawtext=text='${text}':fontsize=110:fontcolor=black:x=320:y=300`,
    );
  args.push(
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-pix_fmt",
    "yuv420p",
    new URL(`${name}.mp4`, folder).pathname,
  );
  const result = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(
      result.stderr || "Install FFmpeg to create video test fixtures.",
    );
}
console.log("Synthetic video fixtures generated.");
