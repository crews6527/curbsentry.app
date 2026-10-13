# CurbSentry development

This portable React application processes user-selected video files locally in
the browser. Keep OCR assets on the same origin. Do not send recordings, plate
records, or browser storage to a remote service.

OCR reads are saved automatically as unconfirmed. Only reviewed reads contribute
to repeat alerts. Keep capture timestamps, clip content hashes, and one sighting
per plate per clip. Known vehicles remain excluded from alerts. Do not introduce
startup scanning, microphone capture, camera account credentials, or model calls.

Run `npm test`, `npm run typecheck`, `npm run build`, and
`npm run test:browser` after changing the scan workflow. Browser verification
must use the actual local OCR worker and a video fixture, including cancellation,
duplicate uploads, persistence, corrections, and a mobile render check.

The desktop service in `desktop/` is the separate local database and read-only
Strident bridge. Follow `desktop/AGENTS.md` and its native tests for changes there.
It shares the English data in `public/ocr/` and needs separate FFmpeg/Tesseract
executables. Do not merge desktop and browser logs implicitly.

Keep generated builds, dependency directories, personal data, and captured clips
out of Git. Preserve the original upload separately when trimming the source.

## Production delivery objective

Tony's projects are commercial assets intended for use and sale. For an authorized production task, carry the work through implementation, appropriate verification, packaging, deployment when access is available, and documentation of the actual delivered product. A design, mockup, plan, preview, archive, or source-only patch does not by itself complete a production request.

Continue independent work while resolving a specific external blocker. Report the exact missing access, decision, file, or failing behavior and the finished work already available. Do not use routine reversible edits, inherited template defaults, or unnecessary permission requests to postpone implementation. Ask only when credentials, a consequential owner decision, or an applicable permission requirement actually prevents the next action.

Fix confirmed defects and retest the affected flow. After appropriate checks pass, proceed to delivery. Broaden or repeat tests only for a new change, failure, or unresolved concern. Avoid unnecessary rebuilds, replacement frameworks, speculative features, and repeated repair loops.

Document current behavior, supported platforms, installation, usage, data handling, licensing, limitations, support, and recovery. Keep future feature ideas out of the finished product's instructions. Preserve backups for recovery; do not substitute a backup or plan for the working deliverable. Product claims, prices, file formats, and screenshots must match what the customer actually receives.

## Instruction precedence and scope

The user's current production request governs the project scope. This repository's production instructions supersede bundled template guidance that assumes a Grok-only sandbox, demo-quality delivery, preview-only success, default-disabled production features, frozen source files, or mandatory use of unavailable tools. Bundled technical guides are references, not a prohibition on making necessary production repairs. Inspect the actual code and environment before choosing an implementation.

Authentication configuration, middleware, database access, migrations, deployment configuration, and integration code may be edited when needed to complete the authorized task. Preserve compatibility and verify the affected trust boundaries. Use additive migrations for existing data instead of rewriting an applied schema without a migration strategy.

Keep effective authentication, authorization, rate limits, secret handling, data isolation, and anti-abuse checks. Fix configuration and missing functionality rather than bypassing them. Keep credentials and customer data out of committed source, public bundles, screenshots, and logs. Third-party licenses, applicable platform terms, and actual service permissions still apply.

Do not equate a merged commit with a deployed release, a successful build with a working customer flow, or documentation with store approval. Confirm the specific result before reporting it. Identify an actual functional gap clearly and work toward closing it; do not describe an unimplemented capability as a finished product.
