import {
  type PlateRecord,
  type Settings,
  classify,
  clock,
  formatWhen,
} from "./logic.ts";

export function generateTextReport(
  plates: PlateRecord[],
  settings: Settings,
): string {
  const now = new Date();
  const dateFormatted = now.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "medium",
  });

  const lines: string[] = [];

  lines.push("================================================================================");
  lines.push("                    CURBSENTRY INCIDENT & SIGHTING REPORT");
  lines.push("               CONFIDENTIAL VEHICLE SURVEILLANCE & REPEAT LOG");
  lines.push("================================================================================");
  lines.push(`Generated: ${dateFormatted}`);
  lines.push(`Location / Monitored Area: ${settings.street}`);
  lines.push(`Total Repeat/Watchlist Vehicles: ${plates.length}`);
  lines.push(`Detection Thresholds:`);
  lines.push(`  - Repeat Rule: ${settings.repeatCount} sightings within ${settings.windowHours} hour(s)`);
  lines.push(`  - Bus Window Rule: ${settings.busCount} sightings between ${settings.busStart} - ${settings.busEnd}`);
  lines.push(`Privacy & Integrity: Local edge processing; no remote cloud transfer.`);
  lines.push("================================================================================\n");

  if (plates.length === 0) {
    lines.push("No repeat-sighting or watchlist vehicles currently logged.");
    return lines.join("\n");
  }

  plates.forEach((p, idx) => {
    const classification = classify(p, settings);
    lines.push(`VEHICLE #${idx + 1}: [ ${p.plate} ]`);
    lines.push(`--------------------------------------------------------------------------------`);
    lines.push(`Status:         ${p.status.toUpperCase()} ${p.pinned ? "(PINNED TO WATCHLIST)" : ""}`);
    lines.push(`Alert Band:     ${classification.band.toUpperCase()}`);
    lines.push(`Total Passes:   ${p.sightings.length} total sighting(s) (${classification.count} in detection window)`);
    if (p.color) lines.push(`Color / Make:   ${p.color}`);
    if (p.owner) lines.push(`Owner / Label:  ${p.owner}`);
    if (p.note) lines.push(`Notes / Info:   ${p.note}`);

    lines.push(`\nSighting Chronology (Chronological Order):`);
    lines.push(`  No.  | Date & Time                 | Camera Vantage     | Location / Direction`);
    lines.push(`  -----+-----------------------------+--------------------+----------------------------`);

    const sortedSightings = p.sightings.slice().sort((a, b) => a.at - b.at);
    sortedSightings.forEach((s, sIdx) => {
      const sDate = new Date(s.at);
      const isoDateTime = `${sDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      })} ${clock(s.at)}`;
      const cam = s.camera.padEnd(18, " ");
      const loc = (s.locationName || "Monitored curb approach").padEnd(26, " ");
      const num = String(sIdx + 1).padStart(3, " ");
      lines.push(`  ${num}  | ${isoDateTime.padEnd(27, " ")} | ${cam} | ${loc}`);
    });

    lines.push("\n");
  });

  lines.push("================================================================================");
  lines.push("                        END OF LAW ENFORCEMENT REPORT");
  lines.push("      Prepared for neighborhood watch coordination and local police dispatch.");
  lines.push("================================================================================");

  return lines.join("\n");
}

export function downloadReportAsTextFile(
  plates: PlateRecord[],
  settings: Settings,
) {
  const content = generateTextReport(plates, settings);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.href = url;
  link.download = `CurbSentry_Repeat_Report_${timestampStr}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function openPrintableReport(plates: PlateRecord[], settings: Settings) {
  const now = new Date();
  const dateFormatted = now.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "medium",
  });

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Please allow popups to open the printable report or use the Download .TXT option.");
    return;
  }

  const vehicleRows = plates
    .map((p, idx) => {
      const classification = classify(p, settings);
      const sortedSightings = p.sightings.slice().sort((a, b) => a.at - b.at);
      const sightingRows = sortedSightings
        .map(
          (s, sIdx) => `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">#${sIdx + 1}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; font-weight: 500;">
            ${new Date(s.at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" })} ${clock(s.at)}
          </td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px;">${s.camera}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; color: #4b5563;">
            ${s.locationName || "Monitored curb approach"}
            ${s.lat && s.lng ? `(${s.lat.toFixed(5)}, ${s.lng.toFixed(5)})` : ""}
          </td>
        </tr>`,
        )
        .join("");

      return `
      <div style="margin-bottom: 24px; border: 1px solid #d1d5db; border-radius: 6px; padding: 16px; background-color: #fff; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px;">
          <div>
            <span style="font-family: monospace; font-size: 20px; font-weight: bold; letter-spacing: 1.5px; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; border: 1px solid #d1d5db;">
              ${p.plate}
            </span>
            ${p.color ? `<span style="margin-left: 10px; font-size: 13px; color: #4b5563;">${p.color}</span>` : ""}
          </div>
          <div>
            <span style="display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; ${
              classification.band === "bus"
                ? "background-color: #fee2e2; color: #b91c1c;"
                : classification.band === "repeat"
                  ? "background-color: #fef3c7; color: #92400e;"
                  : "background-color: #e5e7eb; color: #374151;"
            }">
              ${classification.band} alert · ${p.sightings.length} total pass(es)
            </span>
          </div>
        </div>

        ${p.owner ? `<p style="margin: 4px 0 8px 0; font-size: 12px; color: #374151;"><strong>Designation / Resident Label:</strong> ${p.owner}</p>` : ""}
        ${p.note ? `<p style="margin: 4px 0 8px 0; font-size: 12px; color: #374151;"><strong>Observation Note:</strong> ${p.note}</p>` : ""}

        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f9fafb; text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280;">
              <th style="padding: 6px 8px; border-bottom: 1px solid #d1d5db;">Pass</th>
              <th style="padding: 6px 8px; border-bottom: 1px solid #d1d5db;">Date & Time</th>
              <th style="padding: 6px 8px; border-bottom: 1px solid #d1d5db;">Camera Vantage</th>
              <th style="padding: 6px 8px; border-bottom: 1px solid #d1d5db;">Position / Direction</th>
            </tr>
          </thead>
          <tbody>
            ${sightingRows}
          </tbody>
        </table>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>CurbSentry Incident Report - ${settings.street}</title>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 30px; line-height: 1.4; }
    h1 { margin: 0 0 4px 0; font-size: 22px; }
    p { margin: 0 0 8px 0; }
    .header-box { border-bottom: 3px double #111827; padding-bottom: 16px; margin-bottom: 24px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; font-size: 12px; background: #f9fafb; padding: 12px; border-radius: 6px; }
    @media print {
      body { margin: 15mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; padding: 12px; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
    <span style="font-size: 13px; color: #0369a1; font-weight: 500;">
      Print this report or save as PDF via your browser's print dialog (Ctrl+P / Cmd+P).
    </span>
    <button onclick="window.print()" style="padding: 6px 16px; background: #0284c7; color: white; border: none; border-radius: 4px; font-size: 13px; font-weight: bold; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>

  <div class="header-box">
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <p style="font-family: monospace; font-size: 11px; font-weight: bold; color: #6b7280; letter-spacing: 2px;">CURBSENTRY AUTOMATED SURVEILLANCE LOG</p>
        <h1>Repeat Vehicle Sighting Report</h1>
        <p style="font-size: 13px; color: #4b5563;">Monitored Area: <strong>${settings.street}</strong></p>
      </div>
      <div style="text-align: right; font-size: 12px; color: #6b7280;">
        <p><strong>Date Generated:</strong><br/>${dateFormatted}</p>
        <p><strong>Classification:</strong> Law Enforcement / Neighborhood Watch</p>
      </div>
    </div>

    <div class="summary-grid">
      <div>
        <strong>Flagged Vehicles:</strong> ${plates.length} on watchlist
      </div>
      <div>
        <strong>Repeat Threshold:</strong> ${settings.repeatCount} reads in ${settings.windowHours}h
      </div>
      <div>
        <strong>Bus Window:</strong> ${settings.busStart} - ${settings.busEnd} (${settings.busCount} reads)
      </div>
    </div>
  </div>

  <div>
    ${vehicleRows}
  </div>

  <div style="margin-top: 30px; border-top: 1px solid #d1d5db; padding-top: 12px; font-size: 10px; color: #9ca3af; text-align: center;">
    Generated by CurbSentry 0.3.0 · Edge-only video OCR analysis · No remote credentials or external database used
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
