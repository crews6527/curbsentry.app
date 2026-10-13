# CurbSentry — App Flow & Design Brief

## 1. Design Philosophy & Constitution
CurbSentry adheres to a restrained, high-contrast, functional design system tailored for private security analysis:
- **Tone:** Professional, reliable, zero clutter, purpose-built.
- **Palette:**
  - Ink (`#1e293b` / slate-800) & Deep Blue (`#0f172a` / slate-900)
  - Amber (`#f59e0b` / `#d97706`) for Repeat Sightings
  - Alert Red (`#ef4444` / `#fee2e2`) for Bus-window flags
  - Ok Green (`#10b981`) for Known Household & Neighbor vehicles
- **Typography:** Sans-serif UI with monospace accenting (`font-mono`) for license plate numbers and timestamps.
- **Touch & Accessibility Standards:**
  - WCAG 2.2 AA compliant contrast ratios across light and dark elements.
  - Interactive touch targets strictly >= 44px on mobile viewports.
  - Descriptive, unambiguous button labels (e.g., "Add to known list", "Download CSV (3)", "Run ALPR Scan", "Delete All Data").

---

## 2. Comprehensive User Journey Flow

```
[ First Launch / Hydration ]
             |
             v
   +--------------------+
   | Setup Wizard (1-3) |  --> Set Street Name, School Bus Window, Initial Known Plate
   +--------------------+
             |
             v
+---------------------------------------------------------------------------------+
|                               Primary Navigation                                |
+---------------------------------------------------------------------------------+
  |                |            |            |             |           |         |
  v                v            v            v             v           v         v
[Plate Lookup]   [A.L.P.R.]  [Videos]     [Watch]      [Through]   [Known]   [Export]
  • Search query  • Photo OCR • Upload clip • Active       • Single    • Add     • Status
  • 7-Day Chart   • Pre-proc  • Play/seek   repeats        sightings   known     JSON
  • Camera tags   • Filter cam• OCR sample  • Add notes    • Mark as   • CSV DL  • Backup
  • Sightings list• Diagnostic• Save reads  • Keep watch   neighbor    • Remove  • Legal Hub
```

---

## 3. Screen Breakdown
1. **Plate Lookup (`/lookup`):**
   - Instant search input with status pills (All, Watching, Known, Through).
   - Recharts 7-day trend bar/line visualization for selected vehicle.
   - Expandable plate card detailing camera sources and sighting history.
2. **A.L.P.R. (`/alpr`):**
   - Sub-navigation: Photo Scanner, Sightings Feed, and OCR Diagnostics.
   - Filter dropdown allowing narrowing sightings by specific cameras (Mailbox, Driveway, Front Door, All).
   - Image canvas with interactive crop ROI, sharpening, binarization, and inversion toggles.
3. **Videos (`/videos`):**
   - Video file upload with client-side HTML5 video playback.
   - Frame extractor passing frames to local WebWorker OCR.
4. **Known Cars (`/known`):**
   - Registration form for trusted household and neighbor vehicles.
   - Prominent "Download CSV" button with real-time record count badge and confirmation feedback.
   - List of active known vehicles with one-click removal.
5. **Trust & Compliance Center (Modal):**
   - Privacy Policy, Apple & Google Privacy Labels, Terms of Use (Limited Liability, Governing Law, Indemnification), Cookies & Storage, and Data Deletion Policy.
