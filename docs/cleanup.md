# Source cleanup and the missing video component

Input: `curb-sentry.zip`, SHA-256
`4e8441274e7535d67131055589bca3952b73a514d235e428a1afe58a6ac09c4b`.

The supplied React interface imported `logRead` for manual forms but contained no
video file picker, frame extraction, OCR import, or automatic OCR logging. Its
project memory referenced a separate `curbsentry.py` CLI and desktop folder that
were absent from this export. Those references did not constitute a working
component in the web app.

The separate `CurbSentry_PRIVATE_RC1` desktop service did contain an FFmpeg/
Tesseract helper. It saved suggestions for review rather than automatic confirmed
sightings. The October 9 Strident repair report explicitly states that CurbSentry
was preserved byte for byte. The earlier Ring footage report recovered no
confirmed plate from its three recordings. It fixed frame resolution and review
handling, without establishing accurate automatic plate recognition.

This change adds a browser video scanner, self-hosted OCR assets, persistent
unconfirmed reads, review/correction, clip-based deduplication, capture timestamps,
manual missed-plate entry, and downloadable/restorable log backups. The original
watch/known-car interface and its browser storage key are retained. Fresh logs
contain no sample vehicles. Existing browser data is preserved on the same origin.

Removed from the source package: platform preview caches and deployment output,
generated project metadata, screenshots and generated art references, unused
auth/database/multiplayer/connector scaffolding, generic workspace instructions,
obsolete desktop CLI claims, unused dependencies, unused banner images, and
sample street records. The original upload is retained separately and unchanged.
The Strident project and repository are not modified by this change.

The portable site uses Vite/React and local browser storage. The previous Grok
server infrastructure is not needed for its file scanning or manual log. Original
Grok attribution remains visible. No copied credentials or runtime state are
included.
