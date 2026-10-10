# CurbSentry

Version 0.3.0 includes the portable web app and the separate desktop service used
by Strident. For your Windows installation, use
[desktop/README.md](desktop/README.md). The desktop repair adds actual OCR tool
checks, the shared local English model, spaced plate parsing, persistent partial
reads and focused retries of saved recordings. It preserves the existing desktop
database and read-only Strident bridge.

The portable browser version works independently. Scan a clip on **Videos**,
review possible plate numbers, and keep confirmed sightings with the recording's
capture time and camera name. Its log remains separate from the desktop database.

## Run and build

Use Node.js 22.13 or later (Node 24 is supported).

```sh
npm ci
npm run dev
```

For a production site:

```sh
npm run build
npm run preview
```

Upload the contents of `dist/` to a static HTTPS host. Vercel settings are included.
The source repository contains code, the lockfile, English OCR data, tests, and
license notices. Dependencies and generated OCR runtime files are recreated by
the install/build steps. No account keys or private footage are required.

The downloadable full backup also includes a ready-built site. To run that copy
locally without installing Node, serve its `site/` folder with an existing Python
installation:

```sh
python -m http.server 8766 --bind 127.0.0.1 --directory site
```

Then open `http://127.0.0.1:8766/`. On Windows with Python 3.12, use `py -3.12`
instead of `python`. Opening `index.html` directly as a file does not provide the
secure browser features needed by scanning.

## Read a clip

1. Choose a saved MP4 (H.264) or WebM clip. Other formats work only if the browser
   can decode them. Clips are limited to 100 MiB and ten minutes.
2. Enter its recording start time in your device's time zone and the camera name.
3. Optionally crop the scan area to the part of the picture where plates pass.
4. Choose **Scan video**. The reader samples up to sixty frames and saves possible
   numbers automatically. It uses one OCR worker, released at completion,
   cancellation, or failure.
5. Review a saved read at its video offset, correct it if needed, then confirm it.
   A dismissed read stays in the exported audit data. Use **Enter a plate the
   reader missed** to record a manually reviewed plate with the clip's timestamp.

Automatic reads remain unconfirmed until review and do not trigger repeat alerts.
One plate contributes at most one confirmed sighting per clip, including when two
OCR suggestions are corrected to the same plate. Identical clip bytes reuse their
existing scan, even after renaming. Re-encoded or overlapping recordings have
different hashes and require review to avoid counting the same visit twice.

The recognizer searches for mixed letter/digit tokens of four to eight characters
with a word confidence score of at least 65. That score is an OCR engine estimate,
not a probability of a correct plate. All-letter and all-digit plates can be
entered manually. Background signs and camera overlays can still produce false
reads. This is a general OCR helper with a selectable scan region, not a trained
vehicle/plate detector. Sampling may miss a plate visible between sample times.
It cannot recover characters absent from blurred, distant, or obstructed footage.

Known cars stay excluded from repeat alerts. This application does not identify
vehicle owners, infer a threat, connect to Ring/Blink accounts, or access a live
camera stream. It does not load an AI model or listen to a microphone.

## Keep your records

Video decoding and OCR run locally in the browser. OCR assets are served from the
same site; there are no external OCR requests or uploads of your selected video.
The selected file is used temporarily and is not stored by the app. Retain your
original clips separately.

Settings, automatic reads, and confirmed sightings are saved in browser storage
under `curbsentry-preview-v1`. Existing records on the same origin are retained.
A different host, browser, or device has separate storage. Private browsing,
storage limits, and clearing browser data can remove or prevent saved records.

Use **Export & backup → Download log backup** to save your records as JSON. Restore
validates the file and asks before replacing the current log. Keep that JSON and
your original videos alongside the source backup on your backup drive. This code
package contains no personal plate log, camera footage, or credentials.

The earlier Python desktop service is a separate app with a different database
and a read-only Strident bridge. The web app exports confirmed watch status for
your assistant; it does not automatically synchronize with that desktop service.

## Verify

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests generate clearly labeled synthetic clips using FFmpeg and test the
production site with the actual OCR worker. Set `CURBSENTRY_TEST_MODE=dev` to test
the development server, or `CURBSENTRY_TEST_URL` to test an already-running site.
`CURBSENTRY_CHROMIUM` can select an installed Chromium executable. See
[docs/verification.md](docs/verification.md) for observed results and limits.

The original upload supplied no application license. This package does not grant
additional application rights. Third-party components retain their licenses in
`licenses/`; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
