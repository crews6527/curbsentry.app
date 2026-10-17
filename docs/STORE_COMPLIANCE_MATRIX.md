# CurbSentry release evidence and outstanding checks

Reviewed October 15, 2026. Replaces the previous document's unsupported “Verified,” “Compliant” and certification claims. This is a source review, not Apple/Google acceptance, ISO/IEC 27001 certification, full WCAG conformance, a penetration test or an opinion about lawful surveillance.

| Control | Source evidence | Status / required verification |
| --- | --- | --- |
| RLS | Browser-origin local storage; separate desktop SQLite | No shared PostgreSQL database, so RLS is not applicable to this architecture. Origin isolation is not RLS and does not protect data from device compromise or same-origin XSS. |
| API keys / auth | Browser OCR does not require a cloud-model API key; desktop has separate keys | No whole-product secret audit or production auth certification. Preserve desktop key/Host/Origin protections; never treat them as absent because the browser needs no account. |
| Login limits / Turnstile | Browser edition has no cloud signup/login form | Not applicable to a nonexistent login. Desktop endpoints still need endpoint-specific authorization, resource limits and abuse review. |
| CSP / HSTS / HTTPS / CORS | vercel.json and HTML contain header-policy configuration | Source configuration only. Verify the real deployment and hostname. Meta CSP cannot set HSTS, CORS, frame-ancestors or response status. Current script allowances are broad; do not call them a complete XSS defense. |
| Dependencies | package.json and release lockfile | A dated dependency audit is not a permanent pass. Run the release-specific audit and record actual versions/results. Vercel npm ci needs a matching package-lock.json. |
| Secrets / logs / SQL | No cloud OCR key required; desktop uses its own Python/SQLite paths | Review actual tracked history, bundles and logs. Parameterization in one path does not prove all paths safe. Redact footage, plates, location data and auth keys from telemetry. |
| Privacy labels | Browser local processing and a draft in-app data inventory | No official or approved store declaration. Inventory native wrappers, hosting technical logs, SDKs, exports, desktop bridge and any remote services in the submitted build. |
| Consent / GPC | App adds no advertising pixel; UI can display navigator.globalPrivacyControl | A displayed signal is not a server-wide enforcement mechanism. No claim that the app controls provider logging or independently enforces Do Not Track. |
| Encryption | Browser localStorage and local records | Origin isolation is not application-level encryption. Hash/digest validation is not encryption or authentication. Device access and export protection remain important. |
| Deletion | Reset button calls resetLog and removes the browser persistence key | It resets browser log/settings only. It does not erase recordings, saved exports, browser caches, hosting logs or desktop SQLite. It is not a cloud account-deletion flow. Confirm exact behavior against current storage code. |
| Backups | Manual JSON export/import | Manual feature, not scheduled daily backups. Test a real restore and protect sensitive exported data. No scheduler/destination/retention monitoring is demonstrated. |
| SEO / schema | Canonical, public robots, sitemap and source structured data | Verify the actual origin. Do not fabricate a physical LocalBusiness, commercial offer, author identity, universal OS support or hidden FAQ. llms.txt does not establish rankings or access. |
| Accessibility | Dialog/landmark labels and responsive classes | WCAG 2.2 AA is a target, not established conformance. Test focus containment/return, Escape, keyboard tab controls, screen readers, contrast, zoom/reflow and every error/loading state. |
| Performance | OCR work uses local runtime/workers | Measure p75 field INP against the 200ms goal. Local processing does not guarantee performance on every device. |
| Terms / legal | Local-use restrictions and draft clauses | Clauses need seller identity, applicable law, enforceability and mandatory-consumer-rights review. Local data can still be personal data; no claim that privacy/security risks are eliminated. |
| Native release | React browser app and separate desktop service | No signed native package, store submission or approval demonstrated. Review functionality, permissions, store metadata, payment rules, support URLs and actual SDK/data declarations per release. |

## Claims corrected in the accompanying source patch

The in-app footer no longer claims ISO/IEC 27001 or store compliance. Privacy-label copy is marked as a draft inventory, browser storage is not described as encrypted, and accessibility/INP are targets requiring measurement. The backup control is described as manual; reset labels and success text identify the browser observation log instead of promising complete erasure. This patch does not expand recording access, add cloud telemetry, change OCR decisions or silently export user records.
