# CurbSentry — Store & Application Compliance Matrix

This document provides a line-by-line verification matrix demonstrating how CurbSentry meets Google Play, Apple App Store, Web Standards, and privacy compliance requirements.

| Compliance Checklist Item | CurbSentry Implementation Status & Details |
| :--- | :--- |
| **Turn on RLS / Row-Level Security** | Enforced via browser origin sandboxing (IndexedDB/localStorage per origin). Zero shared multi-tenant database. |
| **.keys server-side / No Secrets in logs** | No remote API keys or cloud tokens used. Zero credentials logged or stored in client bundles. |
| **Lock admin routes / Rate limit logins** | Local-first architecture requires no unauthenticated cloud ingress. Desktop bridge strictly local read-only. |
| **Turnstile / Bot Defense on forms** | All forms execute 100% client-side in the user's browser runtime; no server endpoints to spam or abuse. |
| **CSP + HSTS** | Strict CSP header in `vercel.json` and `<meta>` fallback; HSTS `max-age=63072000; includeSubDomains; preload`. |
| **Npm audit / Vulnerability audit** | Clean audit across runtime dependencies. Regular automated patch verification. |
| **Force HTTPS** | Configured in `vercel.json` deployment headers with automatic TLS redirection. |
| **Error tracking** | Local console error capture with diagnostic download in `AgentPane`; zero remote telemetry sent. |
| **Daily DB backups / Recovery** | Encrypted JSON full export and restore via `BackupControls.tsx`, with automatic pre-modification snapshots. |
| **Honest lastmod / Canonical tags** | `public/sitemap.xml` includes authentic `2026-10-13` lastmod date; canonical tag points to `https://curbsentry.app/`. |
| **Kill noindex / Allow AI search bots** | Standard `robots.txt` explicitly allows Googlebot, Applebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot. |
| **LocalBusiness & FAQ Schemas** | JSON-LD schema in `index.html` implements `SoftwareApplication`, `LocalBusiness`, and `FAQPage` schemas. |
| **Author bylines** | `<meta name="author" content="CurbSentry Security Systems" />` embedded in `index.html`. |
| **No orphan pages** | Single-page application with full tab navigation, accessible footer links, and no dead ends. |
| **INP < 200ms** | Client-side reactive UI (React 19, Zustand) with fast updates and background Web Workers for OCR tasks. |
| **Llms.txt** | Comprehensive markdown guidance file implemented at `/public/llms.txt`. |
| **Global Privacy Control (GPC)** | Respects `navigator.globalPrivacyControl`; displays active status in Compliance Hub Modal. |
| **Consent First / Cookie Policy** | Zero third-party marketing cookies; transparent disclosure of local storage keys (`curbsentry-preview-v1`). |
| **WCAG 2.2 AA Accessibility** | Accessible contrast, ARIA dialog landmarks, focus styles, keyboard navigability, >=44px tap targets. |
| **Limited Liability Clause** | Embedded in Terms of Use section in `ComplianceHubModal.tsx`. |
| **Governing Law Clause** | Explicit jurisdiction clause in Terms of Use section in `ComplianceHubModal.tsx`. |
| **Indemnification Clause** | Standard user indemnification clause in Terms of Use section in `ComplianceHubModal.tsx`. |
| **Data Deletion Policy & Button** | Full Compliance Hub Data Deletion tab with one-click permanent storage purge button. |
| **Apple Privacy Nutrition Labels** | Declared: 0 data collected, 0 data shared, 0 tracking. Available in app and documentation. |
| **Google Play Data Safety** | Declared: No data collected, no data shared, encrypted local storage, full data deletion supported. |
| **Terms of Use & Conditions** | Interactive modal in app (`ComplianceHubModal.tsx`) and documented in `/docs/`. |
| **Parameterized SQL / Validate inputs** | Inputs normalized and length-checked via `normalisePlate` regex; desktop SQLite queries parameterized. |
| **Keep .env off GitHub** | Strictly ignored in `/.gitignore` (`.env*`); safe sample provided in `/.env.example`. |
| **Clear button labels** | Explicit button texts throughout ("Add to known list", "Download CSV", "Run ALPR Scan", "Delete All Data"). |
| **Target Keywords** | Integrated across page `<title>`, `<meta name="description">`, `<h1>`, and application overview. |
| **Product & Tech Requirement Docs** | Authored in `/docs/PRODUCT_REQUIREMENTS_DOCUMENT.md` and `/docs/TECHNICAL_REQUIREMENTS_DOCUMENT.md`. |
| **App Flow & Design Brief** | Authored in `/docs/APP_FLOW_AND_DESIGN_BRIEF.md`. |
