"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/Toast";

type ManualCheckoutControlProps = {
  bookingId: string;
  initialCheckInAt: string | null;
  initialCheckOutAt: string | null;
};

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function ManualCheckoutControl({
  bookingId,
  initialCheckInAt,
  initialCheckOutAt,
}: ManualCheckoutControlProps) {
  const router = useRouter();
  const [checkInAt, setCheckInAt] = useState(toLocalDateTimeValue(initialCheckInAt));
  const [checkOutAt, setCheckOutAt] = useState(toLocalDateTimeValue(initialCheckOutAt));
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function saveSessionTimes() {
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      const response = await fetch("/api/attendance/manual-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          checkInAt: new Date(checkInAt).toISOString(),
          checkOutAt: new Date(checkOutAt).toISOString(),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.message ?? "Unable to update session times.");
        return;
      }

      setFeedback("Check-in and check-out times saved.");
      try {
        const channel = new BroadcastChannel("attendance-updates");
        channel.postMessage({ type: "attendance-update", action: "manual-checkout", bookingId });
        channel.close();
      } catch {
        console.warn("BroadcastChannel not supported");
      }
      router.refresh();
    } catch {
      setError("Unable to update session times.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {feedback && <Toast message={feedback} variant="success" onDismiss={() => setFeedback("")} />}
      {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
      <p className="mb-2 text-sm font-medium text-slate-700">Manually set session times</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`check-in-${bookingId}`} className="form-label text-xs">Check-in</label>
          <input
            id={`check-in-${bookingId}`}
            type="datetime-local"
            value={checkInAt}
            onChange={(event) => setCheckInAt(event.target.value)}
            className="form-input py-2 text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor={`check-out-${bookingId}`} className="form-label text-xs">Check-out</label>
          <input
            id={`check-out-${bookingId}`}
            type="datetime-local"
            value={checkOutAt}
            onChange={(event) => setCheckOutAt(event.target.value)}
            className="form-input py-2 text-sm"
            required
          />
        </div>
        <button
          type="button"
          onClick={saveSessionTimes}
          disabled={!checkInAt || !checkOutAt || isSaving}
          className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save checkout"}
        </button>
      </div>
    </div>
  );
}