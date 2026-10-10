import { useState } from "react";
import { useCurb, validateBackup } from "@/lib/curb/store";

export function BackupControls() {
  const [message, setMessage] = useState("");
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <h2 className="font-semibold">Save your plate log</h2>
      <p className="mt-2 text-sm text-muted">
        Records are saved in this browser. Download a log backup before clearing
        browser data or moving to another device. Keep the original videos
        separately.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="min-h-11 rounded-md bg-deep px-4 text-sm text-bg"
          onClick={() => {
            const { settings, plates, scans } = useCurb.getState();
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      product: "CurbSentry",
                      version: 1,
                      exportedAt: new Date().toISOString(),
                      data: { settings, plates, scans },
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `CurbSentry_Log_${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download log backup
        </button>
        <label className="text-sm">
          Restore log backup
          <input
            type="file"
            accept="application/json,.json"
            className="ml-2 max-w-full"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error("Log backup must be smaller than 10 MiB.");
                const data: unknown = JSON.parse(await file.text());
                validateBackup(data);
                if (
                  !window.confirm(
                    "Replace this browser's plate log and settings with this backup? Download the current log first if you need to keep it.",
                  )
                )
                  return;
                useCurb.getState().restoreBackup(data);
                setMessage("Log backup restored.");
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "The backup could not be restored.",
                );
              }
            }}
          />
        </label>
      </div>
      <p role="status" className="mt-2 text-sm">
        {message}
      </p>
    </div>
  );
}
