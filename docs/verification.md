# CurbSentry 0.2.0 verification

Verified October 10, 2026 (UTC), using Node 24.19.0 on Linux and headless Chromium.

- All 16 unit/regression tests passed. They cover OCR TSV parsing, nearby split
  tokens, rejected timestamps and low scores, bounded video sampling, capture
  timestamps, crop bounds, frame deduplication, duplicate clips, corrected reads,
  known-car exclusion, manual clip reads, and backup validation.
- TypeScript checking and the production Vite build passed with the locked
  dependencies. `npm ls --depth=0` reported the expected installed versions.
- The actual browser OCR worker decoded a generated MP4 and read fictional
  `TEST428`, with about 90 percent word confidence. Three sampled frames produced
  one persistent unconfirmed entry. No OCR output was substituted or mocked.
- Both development and production browser flows passed video selection,
  automatic logging, correction to fictional `TEST429`, original capture-time
  retention, duplicate reuse after renaming, reload persistence, an empty clip,
  cancellation with retained partial reads, a visible malformed-video error,
  personal log download/restore, and mobile overflow checks.
- The ready-built backup passed the same actual OCR browser workflow when served
  by its standard-library Python launcher on Linux. No Python packages are needed.
- Browser checks reported zero page/console errors and zero external HTTP
  requests. OCR worker code, engine files, and language data came from the local
  site. Desktop and mobile screenshots were inspected for readable content and
  layout.

The supplied `curb-sentry.zip` was not modified. The source package contains no
recordings, personal plate records, deployment credentials, or sample vehicle
records. Its full backup includes the built site and third-party license notices.

English model SHA-256 before gzip compression:
`7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`.

## Limits of this verification

Synthetic clear-text videos establish that upload, frame decoding, OCR, automatic
logging, review, and persistence are connected. They do not establish plate
recognition accuracy on road footage. The three earlier Ring clips were not
provided in this batch, so this repair was not tested against them. The earlier
footage report recovered no confirmed plate from those clips.

Real moving, distant, nighttime, or angled plates, mobile Safari performance,
Windows launch behavior, other codecs, actual hosting configuration, and browser
storage exhaustion have not been verified. A selectable crop can reduce
irrelevant background OCR; it does not repair missing plate detail. Manual review
and missed-plate entry remain available. Browser data is separate from the older
Python desktop database and its Strident bridge.

The supplied Codespace identifies `crews6527/curbsentry.app` as the destination
repository, with branch `prompt-copy-studio-main`. The source package and its
checksums are prepared for that branch. Verification above was performed locally;
uncommitted files in the separate Codespace were not inspected or changed.
