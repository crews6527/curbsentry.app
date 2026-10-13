# CurbSentry — Product Requirements Document (PRD)

## 1. Product Summary & Mission
**Product Name:** CurbSentry  
**Category:** Private Security & Neighborhood Video Review / Automated License Plate Reader (ALPR)  
**Distribution Target:** Web Application (PWA / Responsive SPA), Google Play Store, Apple App Store  
**Mission Statement:** Provide homeowners and neighborhood safety volunteers with a private, client-side tool to review security camera footage, recognize license plates using local OCR, and log repeat sightings without sending footage, plates, or timestamps to third-party cloud servers.

---

## 2. Target Keywords & Search Optimization
- **Primary Keywords:** Automated License Plate Reader, ALPR, License Plate Scanner, Camera Security Review, Local OCR
- **Secondary Keywords:** Neighborhood Watch Log, Private Video Review, Ring Camera Footage Scanner, Zero-Cloud ALPR
- **Placement Locations:**
  - **Page Title:** `CurbSentry | Automated License Plate Reader (ALPR) & Video Security Review Log`
  - **URL Slug / Canonical:** `https://curbsentry.app/`
  - **H1 Header:** `A clear record of what passed.` / `Automated License Plate Reader (ALPR)`
  - **Product & App Description:** "CurbSentry is a private, client-side Automated License Plate Reader (ALPR) and neighborhood video security review log. Process camera recordings locally with zero cloud uploads."

---

## 3. Core User Personas
1. **The Vigilant Resident:** Wants to review front-door, driveway, or street-facing camera footage after an incident (e.g., vandalism, theft, suspicious vehicle idling). Needs quick frame extraction and OCR to read plates accurately.
2. **The School-Run Safety Monitor:** Needs custom time-of-day thresholds (e.g. 2:30 PM – 4:00 PM weekdays) to detect repeating traffic during school bus arrival and departure windows.
3. **The Privacy-Conscious Homeowner:** Refuses to send private family recordings or neighbor vehicle records to cloud AI vendors or centralized surveillance databases. Requires 100% on-device processing.

---

## 4. Key Functional Features
### 4.1 Automated License Plate Reader (A.L.P.R.) Tool
- **Photo & Image Scanner:** Allows uploading still photos or snapshots, crops/zooms to ROI, applies image preprocessing (grayscale, binary threshold, inversion), and runs local Tesseract.js OCR.
- **Camera Filter:** Filter sightings by specific camera names (e.g., Mailbox, Driveway, Front Door) or view all.
- **Diagnostics Mode:** Self-test tool to inspect the local WebAssembly LSTM OCR engine and verify language assets.

### 4.2 Plate Lookup & 7-Day Trend Visualizations
- Real-time search across plate numbers, color, owner notes, and camera tags.
- Visual distribution chart (Recharts) showing sightings over the last 7 days with day-by-day frequency counts.
- Timeline of all verified sightings with timestamps and camera sources.

### 4.3 Repeat Sighting & Bus-Window Alert Logic
- Configurable repeat threshold: e.g., 2+ sightings within 24 hours.
- School-bus time window: custom start/end times and weekdays with independent trigger counts.
- One sighting per plate per video clip constraint.

### 4.4 Known Cars Exclusion & CSV Export
- Registered household and neighbor vehicles excluded from repeat-sighting alert badges.
- One-click CSV export: downloads `curbsentry-known-plates-YYYY-MM-DD.csv` with plate numbers, owners, vehicle colors, and sighting counts.

### 4.5 Data Management & Zero-Cloud Security
- Full backup export and restore via validated JSON file.
- One-click Data Deletion Policy and purge button in compliance with Google Play and Apple App Store rules.

---

## 5. Non-Functional Requirements & Compliance
- **Zero Cloud Ingestion:** No credentials, no server endpoints for video or plate ingestion.
- **Interaction to Next Paint (INP):** Target < 200ms on all user interactions.
- **Accessibility:** WCAG 2.2 AA compliant contrast, 44px minimum touch targets, ARIA landmarks, clear button labels.
- **Store Compliance:** Apple Privacy Nutrition Labels and Google Play Data Safety forms declare: 0 data collected, 0 data shared, 0 tracking.
