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
test("7-day distribution computes correct counts and buckets", async () => {
  const { get7DayDistribution } = await import("../src/lib/curb/logic.ts");
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const sightings = [
    { at: now, camera: "Mailbox" },
    { at: now - 3600000, camera: "Driveway" },
    { at: now - oneDay, camera: "Front door" },
    { at: now - 3 * oneDay, camera: "Mailbox" },
  ];
  const dist = get7DayDistribution(sightings, now);
  assert.equal(dist.length, 7);
  assert.equal(dist[6].count, 2); // Today
  assert.equal(dist[5].count, 1); // Yesterday
  assert.equal(dist[3].count, 1); // 3 days ago
  assert.equal(dist[0].count, 0); // 6 days ago
});

test("exportKnownPlatesToCsv exports properly formatted and escaped CSV", async () => {
  const { exportKnownPlatesToCsv } = await import("../src/lib/curb/logic.ts");
  const plates = [
    {
      plate: "NEIGH1",
      status: "known" as const,
      owner: 'Alice, "The Red House"',
      color: "Blue",
      pinned: false,
      note: "",
      sightings: [{ at: 1700000000000, camera: "Mailbox" }],
    },
    {
      plate: "THRU99",
      status: "through" as const,
      owner: "Strangely Known",
      color: "White",
      pinned: false,
      note: "",
      sightings: [],
    },
    {
      plate: "NEIGH2",
      status: "known" as const,
      owner: "Bob Smith",
      color: "",
      pinned: false,
      note: "",
      sightings: [],
    },
  ];

  const csv = exportKnownPlatesToCsv(plates);
  assert.ok(csv.startsWith("\uFEFFLicense Plate,Associated Owner / Description,Vehicle Color,Total Sightings,Last Sighting Date"));
  assert.ok(csv.includes("NEIGH1"));
  assert.ok(csv.includes('"Alice, ""The Red House"""'));
  assert.ok(csv.includes("NEIGH2"));
  assert.ok(csv.includes("Bob Smith"));
  // Through traffic should be excluded from known plates export
  assert.ok(!csv.includes("THRU99"));
});

test("getRecentSightingsActivity returns chronologically sorted sightings limited to 10 across all plates", async () => {
  const { getRecentSightingsActivity } = await import("../src/lib/curb/logic.ts");

  const plates = [
    {
      plate: "CAR1",
      status: "watching" as const,
      owner: "",
      color: "Red",
      pinned: true,
      note: "Slow pass",
      sightings: [
        { at: 100, camera: "Mailbox" },
        { at: 500, camera: "Front door" },
        { at: 300, camera: "Driveway" },
      ],
    },
    {
      plate: "CAR2",
      status: "through" as const,
      owner: "",
      color: "Blue",
      pinned: false,
      note: "",
      sightings: [
        { at: 200, camera: "Driveway" },
        { at: 800, camera: "Mailbox" },
      ],
    },
    {
      plate: "CAR3",
      status: "known" as const,
      owner: "Neighbor Alice",
      color: "Silver",
      pinned: false,
      note: "",
      sightings: [
        { at: 700, camera: "Front door" },
        { at: 900, camera: "Mailbox" },
        { at: 400, camera: "Garage" },
        { at: 1000, camera: "Driveway" },
        { at: 600, camera: "Blink side" },
        { at: 50, camera: "Mailbox" },
      ],
    },
  ];

  const recent10 = getRecentSightingsActivity(plates, 10);
  assert.equal(recent10.length, 10);
  // Must be sorted in descending order of `at`
  assert.equal(recent10[0].plate, "CAR3");
  assert.equal(recent10[0].at, 1000);
  assert.equal(recent10[1].plate, "CAR3");
  assert.equal(recent10[1].at, 900);
  assert.equal(recent10[2].plate, "CAR2");
  assert.equal(recent10[2].at, 800);
  assert.equal(recent10[3].plate, "CAR3");
  assert.equal(recent10[3].at, 700);
  assert.equal(recent10[4].plate, "CAR3");
  assert.equal(recent10[4].at, 600);
  assert.equal(recent10[5].plate, "CAR1");
  assert.equal(recent10[5].at, 500);
  assert.equal(recent10[6].plate, "CAR3");
  assert.equal(recent10[6].at, 400);
  assert.equal(recent10[7].plate, "CAR1");
  assert.equal(recent10[7].at, 300);
  assert.equal(recent10[8].plate, "CAR2");
  assert.equal(recent10[8].at, 200);
  assert.equal(recent10[9].plate, "CAR1");
  assert.equal(recent10[9].at, 100);

  // Test custom limit
  const recent3 = getRecentSightingsActivity(plates, 3);
  assert.equal(recent3.length, 3);
  assert.equal(recent3[0].at, 1000);
  assert.equal(recent3[1].at, 900);
  assert.equal(recent3[2].at, 800);
});

test("bulk store actions markPlatesKnown and deletePlates modify state atomically", async () => {
  const { useCurb } = await import("../src/lib/curb/store.ts");
  const store = useCurb.getState();
  store.resetLog();

  store.logRead({ plate: "BULK1", camera: "Mailbox", initialStatus: "through" });
  store.logRead({ plate: "BULK2", camera: "Mailbox", initialStatus: "watching" });
  store.logRead({ plate: "BULK3", camera: "Mailbox", initialStatus: "through" });

  assert.equal(useCurb.getState().plates.length, 3);

  // Bulk move BULK1 and BULK2 to known
  useCurb.getState().markPlatesKnown(["BULK1", "BULK2"], "Bulk Neighbors");
  const platesAfterKnown = useCurb.getState().plates;
  const p1 = platesAfterKnown.find((p) => p.plate === "BULK1");
  const p2 = platesAfterKnown.find((p) => p.plate === "BULK2");
  const p3 = platesAfterKnown.find((p) => p.plate === "BULK3");

  assert.equal(p1?.status, "known");
  assert.equal(p1?.owner, "Bulk Neighbors");
  assert.equal(p2?.status, "known");
  assert.equal(p3?.status, "through");

  // Bulk delete BULK1 and BULK3
  useCurb.getState().deletePlates(["BULK1", "BULK3"]);
  const platesAfterDelete = useCurb.getState().plates;
  assert.equal(platesAfterDelete.length, 1);
  assert.equal(platesAfterDelete[0].plate, "BULK2");
});

test("accurately normalizes and logs hyphenated plates like LK8-T3U and TM1-T8N", async () => {
  const { normalisePlate } = await import("../src/lib/curb/logic.ts");
  assert.equal(normalisePlate("LK8-T3U"), "LK8T3U");
  assert.equal(normalisePlate("TM1-T8N"), "TM1T8N");

  useCurb.getState().resetLog();
  const saved1 = useCurb.getState().logRead({
    plate: "LK8-T3U",
    camera: "Mailbox",
    initialStatus: "watching",
    note: "Silver sedan",
  });
  assert.equal(saved1, "LK8T3U");

  const saved2 = useCurb.getState().logRead({
    plate: "TM1-T8N",
    camera: "Driveway",
    initialStatus: "known",
    owner: "Neighbor Tom",
  });
  assert.equal(saved2, "TM1T8N");

  const plates = useCurb.getState().plates;
  const p1 = plates.find((p) => p.plate === "LK8T3U");
  const p2 = plates.find((p) => p.plate === "TM1T8N");

  assert.ok(p1);
  assert.equal(p1.status, "watching");
  assert.equal(p1.sightings[0].camera, "Mailbox");
  assert.ok(p1.sightings[0].lat);

  assert.ok(p2);
  assert.equal(p2.status, "known");
  assert.equal(p2.owner, "Neighbor Tom");
});

test("generates formatted report for authorities with timestamps and camera vantages", async () => {
  const { generateTextReport } = await import("../src/lib/curb/report-generator.ts");
  const testPlates = [
    {
      plate: "REPEAT9",
      status: "watching" as const,
      owner: "Red Pickup",
      note: "Speeding past intersection",
      color: "Red",
      pinned: true,
      sightings: [
        { at: Date.now() - 3600_000, camera: "Mailbox", locationName: "Eastbound Curb" },
        { at: Date.now() - 1800_000, camera: "Driveway", locationName: "Driveway Apron" },
      ],
    },
  ];

  const report = generateTextReport(testPlates, defaultSettings());
  assert.ok(report.includes("CURBSENTRY INCIDENT & SIGHTING REPORT"));
  assert.ok(report.includes("REPEAT9"));
  assert.ok(report.includes("Mailbox"));
  assert.ok(report.includes("Driveway"));
  assert.ok(report.includes("Eastbound Curb"));
});
