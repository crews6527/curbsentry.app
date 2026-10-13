# CurbSentry — Technical Requirements Document (TRD)

## 1. System Architecture Overview
CurbSentry is architected as a local-first, zero-cloud Progressive Web Application (PWA / SPA) running on React 19, TypeScript, and Vite, with local WebAssembly (Wasm) execution.

```
+-----------------------------------------------------------------------+
|                           User Web Browser                            |
|                                                                       |
|  +--------------------+     +-------------------+     +-------------+ |
|  | HTML5 Video / Canvas| --> | Pre-processing    | --> | Tesseract.js| |
|  | File API (Local)   |     | (Grayscale/Invert)|     | Local Wasm  | |
|  +--------------------+     +-------------------+     +-------------+ |
|                                                              |        |
|                                                              v        |
|  +--------------------+     +-------------------+     +-------------+ |
|  | LocalStorage / IDB | <-- | Zustand Store     | <-- | OCR TSV     | |
|  | (Sandboxed Client) |     | (Logic & Rules)   |     | Parser      | |
|  +--------------------+     +-------------------+     +-------------+ |
+-----------------------------------------------------------------------+
        | Zero Network Egress for Videos or Plates
        v
  [ No Cloud Server / No Remote Database / 100% On-Device Privacy ]
```

---

## 2. Technical Stack
- **Runtime Environment:** Universal Client (Chromium, WebKit, Gecko engines on Windows, macOS Intel & Apple Silicon, Android, iOS, Linux).
- **Core Framework:** React 19.2.8 + TypeScript 6.0.3
- **Build Tool:** Vite 8.2.1 with `@tailwindcss/vite` 4.3.0
- **State Management & Persistence:** Zustand 5.0.0 with localStorage persist middleware (`curbsentry-preview-v1`).
- **OCR Engine:** Tesseract.js 7.0.0 (Wasm core + Web Worker thread + local trained model in `/public/ocr/eng.traineddata.gz`).
- **Data Visualizations:** Recharts 3.x for 7-day trend distributions.
- **Iconography:** Lucide React 0.510.0.

---

## 3. Data Schema & Persistence Model
The client-side state schema is defined in `src/lib/curb/store.ts`:
- **`PlateRecord`**:
  - `plate`: Normalized alphanumeric uppercase string (4 to 8 characters).
  - `color` (optional): User-entered vehicle color.
  - `owner` (optional): Associated neighbor/owner identity.
  - `note` (optional): Observation details.
  - `status`: `"watching"` | `"known"` | `"through"`
  - `pinned`: Boolean override for watch status.
  - `sightings`: Array of `Sighting` records (`{ at: timestamp, camera: string, clipId?: string, offsetSeconds?: number }`).
- **`SettingsState`**:
  - `street`: Street identification label.
  - `repeatCount`: Minimum reads within window to trigger repeat status (default: 2).
  - `windowHours`: Rolling observation window in hours (default: 24).
  - `busEnabled`: Boolean toggle for school-time rules.
  - `busCount`: Threshold count for bus window (default: 2).
  - `busStart`, `busEnd`: Time strings in HH:mm format.
  - `weekdays`: Array of active weekday indices (0–6).

---

## 4. Security & Compliance Architecture
1. **Content Security Policy (CSP):**
   ```
   default-src 'self'; script-src 'self' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; font-src 'self' data:;
   ```
2. **HTTP Strict Transport Security (HSTS):**
   Enforced via `vercel.json` with `max-age=63072000; includeSubDomains; preload`.
3. **Data Isolation & Row-Level Security Equivalent:**
   Because CurbSentry is an offline-capable client app, complete data isolation is enforced at the browser sandbox level:
   - Data is partitioned per-origin in browser sandboxed storage.
   - No remote API keys or database tokens exist in client source code.
   - `.env*` files are strictly excluded from version control (`.gitignore`).
4. **Data Deletion Mandate:**
   Both Apple and Google require accessible data deletion mechanisms. CurbSentry implements a permanent purge handler that clears `localStorage`, `sessionStorage`, and Zustand state immediately upon user confirmation.
5. **Global Privacy Control (GPC):**
   Respects `navigator.globalPrivacyControl` by asserting zero-telemetry client execution.
6. **Input Sanitization & Validation:**
   - Plate inputs are normalized via `normalisePlate()` (`[A-Z0-9]` regex, 4–8 character length validation).
   - CSV exports are escaped via RFC 4180 rules (quotes, commas, newline escaping with UTF-8 BOM).
