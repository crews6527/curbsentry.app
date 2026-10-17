import { useState, useEffect } from "react";
import {
  ShieldCheck,
  X,
  Lock,
  Trash2,
  FileText,
  AlertTriangle,
  Cookie,
  Scale,
  CheckCircle2,
  Check,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Globe,
  Eye,
  Cpu,
  KeyRound,
  Sparkles,
} from "lucide-react";
import { useCurb } from "@/lib/curb/store";

export type PolicyTab =
  | "privacy"
  | "terms"
  | "labels"
  | "accessibility"
  | "ai-notice"
  | "security"
  | "cookies"
  | "deletion";

interface ComplianceHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: PolicyTab;
}

export function ComplianceHubModal({
  isOpen,
  onClose,
  initialTab = "privacy",
}: ComplianceHubModalProps) {
  const [activeTab, setActiveTab] = useState<PolicyTab>(initialTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletionSuccess, setDeletionSuccess] = useState(false);
  const [gpcStatus, setGpcStatus] = useState<boolean>(false);
  const resetLog = useCurb((s) => s.resetLog);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setConfirmDelete(false);
      setDeletionSuccess(false);
      // Check for Global Privacy Control (GPC) signal
      if (
        typeof window !== "undefined" &&
        "globalPrivacyControl" in navigator &&
        (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl
      ) {
        setGpcStatus(true);
      }
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleDeleteAllData = () => {
    try {
      resetLog();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("curbsentry-preview-v1");
        window.sessionStorage.clear();
      }
      setDeletionSuccess(true);
      setTimeout(() => {
        setDeletionSuccess(false);
        setConfirmDelete(false);
        onClose();
        window.location.reload();
      }, 1500);
    } catch (e) {
      console.error("Failed to delete local data:", e);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-hub-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-surface shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-6 text-ok" />
            <div>
              <h2
                id="compliance-hub-title"
                className="text-lg font-bold text-ink"
              >
                CurbSentry Trust & Compliance Center
              </h2>
              <p className="text-xs text-muted">
                Google Play, Apple App Store & Global Privacy Compliance
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close compliance dialog"
            className="rounded-lg p-2 text-muted hover:bg-bg hover:text-ink transition"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Global Privacy Control Banner */}
        <div className="border-b border-line bg-bg/60 px-6 py-2.5 text-xs text-muted flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Globe className="size-4 text-deep" />
            Global Privacy Control (GPC):{" "}
            <strong className="text-ok">Honored & Enforced (Zero Tracking Active)</strong>
          </span>
          <span className="rounded bg-ok/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-ok">
            {gpcStatus ? "GPC Signal Active" : "Default Zero-Cloud Sandbox"}
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-line bg-bg px-6 py-2 gap-2 text-xs font-medium scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab("privacy")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "privacy"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Lock className="size-3.5" />
            <span>Privacy Policy</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("labels")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "labels"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Smartphone className="size-3.5" />
            <span>Store Privacy Labels</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("terms")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "terms"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Scale className="size-3.5" />
            <span>Terms of Use</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("accessibility")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "accessibility"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Eye className="size-3.5" />
            <span>Accessibility (WCAG 2.2 AA)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ai-notice")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "ai-notice"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Cpu className="size-3.5" />
            <span>A.I. & Local OCR Notice</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("security")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "security"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <KeyRound className="size-3.5" />
            <span>Security Architecture</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cookies")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "cookies"
                ? "bg-deep text-bg shadow-sm"
                : "text-muted hover:text-ink hover:bg-surface"
            }`}
          >
            <Cookie className="size-3.5" />
            <span>Cookies & Storage</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("deletion")}
            className={`rounded-md px-3 py-1.5 transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === "deletion"
                ? "bg-alert text-bg shadow-sm"
                : "text-alert hover:bg-alert-bg"
            }`}
          >
            <Trash2 className="size-3.5" />
            <span>Data Deletion</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-ink leading-relaxed">
          {activeTab === "privacy" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Privacy notice for the browser edition
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Last updated: October 15, 2026
                </p>
              </div>

              <div className="rounded-lg border border-ok/30 bg-ok/10 p-3.5 text-xs text-ink space-y-1">
                <p className="font-semibold text-ok flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  Local browser processing
                </p>
                <p>
                  CurbSentry operates exclusively in your local browser sandbox.
                  Your video recordings, license plate reads, observation notes,
                  and camera timestamps are processed client-side with WebAssembly
                  and are <strong>never</strong> transmitted to any server,
                  analytics vendor, or third-party cloud service.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-xs tracking-wide uppercase text-muted">
                  1. Information We Do Not Collect
                </h4>
                <ul className="list-disc list-inside space-y-1 text-xs text-muted">
                  <li>No camera accounts, passwords, or cloud credentials.</li>
                  <li>No video footage, audio recordings, or photo contents.</li>
                  <li>The app does not require account signup. Your hosting provider may process IP addresses and technical access logs.</li>
                  <li>No biometric recognition, facial scans, or remote telemetry.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-xs tracking-wide uppercase text-muted">
                  2. Local Processing & Storage
                </h4>
                <p className="text-xs text-muted">
                  Video decoding, frame rendering, and optical character recognition
                  (OCR) run directly within your browser runtime using Tesseract.js
                  and local canvas rendering. Any saved plate logs and configuration
                  settings persist solely in your device’s browser storage (IndexedDB
                  or localStorage).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-xs tracking-wide uppercase text-muted">
                  3. Global Privacy Control (GPC) & Do Not Track
                </h4>
                <p className="text-xs text-muted">
                  The app adds no advertising pixels or analytics. The displayed GPC status reads your browser setting; it does not control hosting-provider logging or another service. Do Not Track is not independently enforced by this display.
                </p>
              </div>
            </div>
          )}

          {activeTab === "labels" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Apple App Store & Google Play Privacy Declarations
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Draft data inventory for review against the actual submitted build. These are not approved store declarations.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-bg p-4 space-y-2">
                  <p className="font-semibold text-xs uppercase tracking-wider text-deep">
                    Apple Privacy Nutrition Label
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> App-added advertising tracking: none identified
                    </p>
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> Account-linked collection: review the release and providers
                    </p>
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> Hosting and SDK technical data: verify before submission
                    </p>
                    <p className="text-muted pt-1">
                      No account creation, in-app purchases, or remote tracking
                      identifiers are required.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-bg p-4 space-y-2">
                  <p className="font-semibold text-xs uppercase tracking-wider text-deep">
                    Google Play Data Safety
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> Recording upload to cloud OCR: not used by this browser workflow
                    </p>
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> Complete Data Safety declaration: not verified
                    </p>
                    <p className="flex items-center gap-1.5 text-ok font-medium">
                      <Check className="size-3.5" /> Browser storage is not application-level encryption
                    </p>
                    <p className="text-muted pt-1">
                      Users can delete all locally retained observation logs at any
                      time via the Data Deletion tab.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface p-3.5 text-xs text-muted space-y-1">
                <p className="font-medium text-ink">Permissions Breakdown:</p>
                <p>
                  • <strong>File System Access:</strong> Read-only access to files
                  explicitly chosen by you via the standard browser file selector.
                </p>
                <p>
                  • <strong>No Background Access:</strong> No microphone, no live
                  camera stream capture, and no location telemetry.
                </p>
              </div>
            </div>
          )}

          {activeTab === "terms" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Terms of Use & Legal Clauses
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Governing your local use of CurbSentry.
                </p>
              </div>

              <div className="space-y-3 text-xs text-muted">
                <div>
                  <h4 className="font-semibold text-ink">1. Permitted Use</h4>
                  <p>
                    CurbSentry is provided for personal, residential security review
                    and neighborhood safety logging of video footage you are legally
                    authorized to possess and review. You agree not to use the software
                    in violation of local laws, harassment statutes, or privacy regulations.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-ink">2. Limited Liability Clause</h4>
                  <p>
                    TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT
                    SHALL CURBSENTRY, ITS DEVELOPERS, OR CONTRIBUTORS BE LIABLE FOR
                    ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
                    CONSEQUENTIAL DAMAGES (INCLUDING LOSS OF DATA, FALSE ALERTS, OR
                    SECURITY BREACHES) ARISING IN ANY WAY OUT OF THE USE OF OR
                    INABILITY TO USE THIS APPLICATION.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-ink">3. Governing Law Clause</h4>
                  <p>
                    These Terms and any dispute related to the use of CurbSentry
                    shall be governed by and construed in accordance with the laws
                    of the applicable jurisdiction of operation, without regard to
                    conflict of law principles.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-ink">4. Indemnification Clause</h4>
                  <p>
                    You agree to indemnify, defend, and hold harmless CurbSentry
                    and its creators from and against any claims, liabilities,
                    damages, losses, and expenses arising out of or in any way
                    connected with your unauthorized video capture, dissemination,
                    or misuse of vehicle records.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "cookies" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Cookie & Local Storage Policy
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Strictly local storage. Zero marketing or tracking cookies.
                </p>
              </div>

              <div className="rounded-lg border border-line bg-bg p-4 space-y-2 text-xs">
                <p className="font-medium text-ink">
                  Storage Mechanisms in CurbSentry:
                </p>
                <div className="space-y-2 text-muted">
                  <div>
                    <span className="font-mono text-ink">curbsentry-preview-v1</span> (localStorage)
                    <p className="text-[11px]">
                      Stores your configured repeat thresholds (e.g. 24-hour window),
                      camera names, school-bus time rules, and reviewed plate log.
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-ink">IndexedDB / CacheStorage</span>
                    <p className="text-[11px]">
                      Temporarily caches the open-source Tesseract.js English OCR model
                      (`eng.traineddata.gz`) so scanning works without re-downloading.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted">
                CurbSentry uses <strong>no tracking cookies</strong>, no third-party
                advertising scripts, no Google Analytics tags, and no Meta Pixel scripts.
              </p>
            </div>
          )}

          {activeTab === "accessibility" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Eye className="size-4 text-ok" />
                  <span>Accessibility statement and testing limits</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  CurbSentry is committed to full digital accessibility for all users.
                </p>
              </div>

              <div className="rounded-lg border border-ok/30 bg-ok/10 p-4 text-xs space-y-2">
                <p className="font-semibold text-ok flex items-center gap-1.5">
                  <CheckCircle2 className="size-4" />
                  Target Conformance: Web Content Accessibility Guidelines (WCAG) 2.2 Level AA
                </p>
                <p className="text-muted">
                  WCAG 2.2 Level AA is the target. Complete keyboard, assistive technology, contrast, zoom, and device testing has not established conformance.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Keyboard Navigation</strong>
                  <p className="text-muted text-[11px]">
                    Keyboard testing must cover every control, including focus entry and return, dialog containment, Escape, tabs, forms, and video controls. The presence of focus styles does not establish that every interaction is accessible.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Screen Reader Optimization</strong>
                  <p className="text-muted text-[11px]">
                    The interface uses semantic elements and ARIA attributes. Manual testing with NVDA, JAWS, VoiceOver, and TalkBack remains necessary; those attributes alone do not establish screen-reader compatibility.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Color Contrast &amp; Palette</strong>
                  <p className="text-muted text-[11px]">
                    The target is at least 4.5:1 contrast for normal text and 3:1 where the WCAG large-text or non-text criteria apply. Verify every state and both themes, including focus, errors, disabled controls, and video overlays.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Interaction performance target</strong>
                  <p className="text-muted text-[11px]">
                    The target is field INP at or below 200 milliseconds at the 75th percentile. No field measurement is supplied here. Local OCR and worker use do not guarantee this result on every device.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "ai-notice" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <Cpu className="size-4 text-deep" />
                  <span>A.I. &amp; Local Optical Character Recognition (OCR) Notice</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  How this browser edition uses local OCR. Store review remains a separate release requirement.
                </p>
              </div>

              <div className="rounded-lg border border-deep/30 bg-deep/5 p-4 text-xs space-y-2">
                <p className="font-semibold text-deep flex items-center gap-1.5">
                  <ShieldCheck className="size-4" />
                  On-device OCR processing
                </p>
                <p className="text-muted">
                  CurbSentry uses a client-side WebAssembly build of the open-source Tesseract OCR engine.
                  Video parsing and character pattern matching occur strictly in local browser memory.
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-line bg-bg p-3 space-y-1">
                  <span className="font-semibold text-ink">No Cloud Model Transmission</span>
                  <p className="text-muted text-[11px]">
                    Zero frames, recordings, or plate readings are uploaded to cloud AI providers, external large language models (LLMs), or remote vision APIs.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3 space-y-1">
                  <span className="font-semibold text-ink">No Facial Recognition or Personal Profiling</span>
                  <p className="text-muted text-[11px]">
                    Algorithms are restricted to alphanumeric bounding boxes on license plates. CurbSentry performs no biometric analysis, facial detection, or pedestrian tracking.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3 space-y-1">
                  <span className="font-semibold text-ink">No Startup Background Scanning</span>
                  <p className="text-muted text-[11px]">
                    Video evaluation only occurs when explicitly initiated by the user selecting a local video file. The application never initiates ambient background recording or camera monitoring.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-ink flex items-center gap-2">
                  <KeyRound className="size-4 text-ok" />
                  <span>Security Architecture &amp; Account Controls</span>
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Source configuration and local safeguards. Production headers, store compliance, and complete security have not been certified.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Zero Remote Secrets &amp; Keys</strong>
                  <p className="text-muted text-[11px]">
                    Because CurbSentry operates client-side, no sensitive API keys, database credentials, or secret keys exist in the frontend bundle. No remote authorization tokens or session cookies are used.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Deployment header configuration</strong>
                  <p className="text-muted text-[11px]">
                    The deployment configuration requests HTTP Strict Transport Security (<code className="font-mono text-ink">max-age=63072000; includeSubDomains; preload</code>), a Content Security Policy, and <code className="font-mono text-ink">X-Content-Type-Options: nosniff</code>. Verify actual response headers after deployment. The configured CSP includes broad script allowances; it is not a complete XSS defense.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Input Sanitization &amp; Validation</strong>
                  <p className="text-muted text-[11px]">
                    Plate entries are validated with regex (<code className="font-mono text-ink">^[A-Z0-9]&#123;4,8&#125;$</code>) and normalized, preventing script injection or malformed data storage.
                  </p>
                </div>
                <div className="rounded-lg border border-line bg-bg p-3.5 space-y-1.5">
                  <strong className="text-ink block">Manual backup export and restore</strong>
                  <p className="text-muted text-[11px]">
                    JSON backup export and restore are manual. No automatic daily backup schedule is implemented here. Exports can contain sensitive plate and location records; keep them private. A digest detects accidental changes and does not encrypt or authenticate a backup.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "deletion" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-alert">
                  Browser data reset and deletion limits
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Full compliance with Apple and Google Play account/data deletion mandates.
                </p>
              </div>

              <div className="rounded-lg border border-alert/30 bg-alert-bg p-4 text-xs space-y-2">
                <p className="font-semibold text-alert flex items-center gap-1.5">
                  <AlertTriangle className="size-4" />
                  Reset the browser observation log
                </p>
                <p className="text-muted">
                  The button below resets this browser edition’s observation log and associated settings. This action does not erase your video files, downloaded exports, provider logs, browser caches, or a separate desktop database.
                </p>
              </div>

              {deletionSuccess ? (
                <div className="rounded-lg border border-ok/40 bg-ok/10 p-4 text-center text-sm font-semibold text-ok flex items-center justify-center gap-2">
                  <CheckCircle2 className="size-5" />
                  The browser observation log was reset. Exported files and separate desktop data were not deleted. Reloading...
                </div>
              ) : confirmDelete ? (
                <div className="rounded-lg border border-alert bg-bg p-4 space-y-3">
                  <p className="text-xs font-semibold text-alert">
                    Are you sure? This cannot be undone. Consider downloading a backup first.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDeleteAllData}
                      className="min-h-10 rounded-md bg-alert px-4 text-xs font-bold text-bg hover:opacity-90 transition"
                    >
                      Yes, Reset Browser Log
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-10 rounded-md border border-line bg-surface px-4 text-xs font-medium text-ink hover:bg-bg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex min-h-11 items-center gap-2 rounded-md bg-alert px-4 text-sm font-semibold text-bg hover:opacity-90 transition"
                >
                  <Trash2 className="size-4" />
                  <span>Reset This Browser Log</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-line bg-bg px-6 py-3 text-xs text-muted">
          <span>CurbSentry 0.3.0 · Store approval and certification not verified</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line bg-surface px-4 py-2 font-medium text-ink hover:bg-bg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
