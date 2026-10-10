import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatesFromTsv,
  sampleOffsets,
  validateCapture,
  validateCrop,
  FULL_FRAME,
} from "../src/lib/curb/scan-logic.ts";
import {
  addSighting,
  mergeReads,
  defaultSettings,
  validateBackup,
  useCurb,
} from "../src/lib/curb/store.ts";
import { classify, sightingsInWindow } from "../src/lib/curb/logic.ts";

const header =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const word = (text: string, confidence = 95, left = 0, line = 1) =>
  `5\t1\t1\t1\t${line}\t1\t${left}\t0\t90\t30\t${confidence}\t${text}`;
test("finds whole and space-separated plate tokens at their evidence offsets", () => {
  const reads = candidatesFromTsv(
    [
      header,
      word("TEST428"),
      word("ABC", 91, 0, 2),
      word("1234", 90, 110, 2),
    ].join("\n"),
    4.5,
  );
  assert.deepEqual(
    reads.map((r) => r.plate),
    ["TEST428", "ABC1234"],
  );
  assert.equal(reads[0].offsetSeconds, 4.5);
});
test("rejects timestamps, plain words, numbers and low confidence text", () => {
  assert.deepEqual(
    candidatesFromTsv(
      [
        header,
        word("12:30:00"),
        word("CAMERA", 98, 0, 2),
        word("20261009", 95, 0, 3),
        word("TEST428", 30, 0, 4),
      ].join("\n"),
      0,
    ),
    [],
  );
});
test("parses the headerless TSV returned by the actual browser OCR engine", () => {
  const reads = candidatesFromTsv(word("TEST428", 92), 0.5);
  assert.equal(reads[0].plate, "TEST428");
  assert.equal(reads[0].confidence, 92);
});
test("does not join unrelated distant words", () => {
  assert.deepEqual(
    candidatesFromTsv(
      [header, word("ABC"), word("1234", 90, 1000)].join("\n"),
      0,
    ),
    [],
  );
});
test("video sampling is bounded and offsets stay inside very short clips", () => {
  assert.equal(sampleOffsets(600).length, 60);
  assert(sampleOffsets(0.02)[0] < 0.02);
  for (const d of [0, -1, 601, Infinity, NaN])
    assert.throws(() => sampleOffsets(d));
});
test("capture time and crop validation reject invalid inputs", () => {
  assert.throws(() => validateCapture(Date.now() + 3_600_000));
  assert.throws(() => validateCapture(NaN));
  assert.throws(() => validateCrop({ x: 90, y: 0, width: 20, height: 100 }));
  assert.deepEqual(validateCrop(FULL_FRAME), FULL_FRAME);
});
test("repeated frames save one unconfirmed read and retain best score", () => {
  const a = mergeReads(
    [],
    [{ plate: "TEST428", confidence: 80, offsetSeconds: 1 }],
  );
  const b = mergeReads(a, [
    { plate: "TEST428", confidence: 96, offsetSeconds: 2 },
  ]);
  assert.equal(b.length, 1);
  assert.equal(b[0].status, "unconfirmed");
  assert.equal(b[0].frameCount, 2);
  assert.equal(b[0].offsetSeconds, 1);
  assert.equal(b[0].confidence, 96);
  assert.equal(a[0].frameCount, 1);
});
test("invalid candidates cannot enter the log", () => {
  assert.equal(
    mergeReads(
      [],
      [
        { plate: "T1", confidence: 95, offsetSeconds: 1 },
        { plate: "TEST428", confidence: 99, offsetSeconds: NaN },
      ],
    ).length,
    0,
  );
});
test("one plate per clip is counted once and capture time is retained", () => {
  const at = Date.now() - 3_600_000;
  const p = addSighting([], {
    plate: "TEST428",
    camera: "Door",
    at,
    clipId: "a",
  });
  const duplicate = addSighting(p, {
    plate: "TEST428",
    camera: "Door",
    at: at + 10_000,
    clipId: "a",
  });
  assert.equal(duplicate, p);
  assert.equal(p[0].sightings[0].at, at);
  assert.equal(
    addSighting(p, {
      plate: "TEST428",
      camera: "Door",
      at: at + 1000,
      clipId: "b",
    })[0].sightings.length,
    2,
  );
});
test("out of order captures are sorted and future sightings are excluded", () => {
  const at = Date.now() - 60_000;
  const p = addSighting(
    addSighting([], { plate: "TEST428", camera: "Door", at }),
    { plate: "TEST428", camera: "Door", at: at - 1000 },
  );
  assert.equal(p[0].sightings[0].at, at - 1000);
  assert.equal(
    sightingsInWindow([{ at: at + 1000, camera: "Door" }], at, 2).length,
    0,
  );
});
test("known plates never become repeat alerts", () => {
  const at = Date.now() - 60_000;
  let p = addSighting([], { plate: "TEST428", camera: "Door", at });
  p[0].status = "known";
  for (let i = 1; i < 5; i++)
    p = addSighting(p, { plate: "TEST428", camera: "Door", at: at + i });
  assert.equal(classify(p[0], defaultSettings(), at + 10).band, "known");
});
test("automatic logging stays separate from confirmed sightings", () => {
  useCurb.getState().resetLog();
  const scan = useCurb.getState().beginScan({
    digest: "a".repeat(64),
    name: "clip.mp4",
    camera: "Door",
    capturedAt: Date.now() - 60_000,
    crop: FULL_FRAME,
  });
  useCurb
    .getState()
    .recordFrame(
      scan.id,
      [{ plate: "TEST428", confidence: 90, offsetSeconds: 1 }],
      1,
      2,
    );
  assert.equal(useCurb.getState().plates.length, 0);
  const read = useCurb.getState().scans[0].reads[0];
  assert.equal(
    useCurb.getState().confirmRead(scan.id, read.id, "TEST429"),
    "TEST429",
  );
  assert.equal(useCurb.getState().plates[0].plate, "TEST429");
  assert.equal(useCurb.getState().confirmRead(scan.id, read.id, "TEST429"), "");
});
test("completed duplicate uploads reuse the scan by digest", () => {
  const old = useCurb.getState().scans[0];
  useCurb.getState().finishScan(old.id, "complete", "Done");
  const next = useCurb.getState().beginScan({
    digest: old.digest,
    name: "renamed.mp4",
    camera: "Other",
    capturedAt: Date.now(),
    crop: FULL_FRAME,
  });
  assert.equal(next.id, old.id);
  assert.equal(next.camera, "Door");
  assert.equal(useCurb.getState().scans.length, 1);
});
test("manual missed-plate entry uses capture time and rejects offsets past the clip", () => {
  const scan = useCurb.getState().scans[0];
  useCurb.getState().recordFrame(scan.id, [], 2, 2, 2);
  assert.equal(useCurb.getState().logClipRead(scan.id, "MISS42", 3), "");
  assert.equal(useCurb.getState().logClipRead(scan.id, "MISS42", 1), "MISS42");
  const sighting = useCurb.getState().plates.find((p) => p.plate === "MISS42")!
    .sightings[0];
  assert.equal(sighting.at, scan.capturedAt + 1000);
  assert.equal(sighting.clipId, scan.digest);
});
test("a corrected read is not added again when later frames repeat the OCR text", () => {
  const scan = useCurb.getState().scans[0];
  useCurb
    .getState()
    .recordFrame(
      scan.id,
      [{ plate: "TEST428", confidence: 99, offsetSeconds: 1 }],
      2,
      2,
    );
  assert.equal(useCurb.getState().scans[0].reads.length, 1);
  assert.equal(useCurb.getState().scans[0].reads[0].plate, "TEST429");
});
test("log backup round trip validates and preserves records", () => {
  const { settings, plates, scans } = useCurb.getState();
  const payload = {
    product: "CurbSentry",
    version: 1,
    data: { settings, plates, scans },
  };
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(payload))).plates,
    plates,
  );
  const invalid = JSON.parse(JSON.stringify(payload));
  invalid.data.scans[0].reads[0].offsetSeconds = 700;
  assert.throws(() => validateBackup(invalid));
  assert.throws(() => validateBackup({}));
});
