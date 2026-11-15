"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/Toast";
import { easternTimeOccurrence, parseEasternDateTimeInput, toEasternDateTimeInput } from "@/lib/date-format";

type ManualCheckoutControlProps = {
  bookingId: string;
  initialCheckInAt: string | null;
  initialCheckOutAt: string | null;
};

export function ManualCheckoutControl({
  bookingId,
  initialCheckInAt,
  initialCheckOutAt,
}: ManualCheckoutControlProps) {
  const router = useRouter();
  const [checkInAt, setCheckInAt] = useState(initialCheckInAt ? toEasternDateTimeInput(initialCheckInAt) : "");
  const [checkOutAt, setCheckOutAt] = useState(initialCheckOutAt ? toEasternDateTimeInput(initialCheckOutAt) : "");
  const [checkInOccurrence, setCheckInOccurrence] = useState<"first" | "second">(initialCheckInAt ? easternTimeOccurrence(initialCheckInAt) : "first");
  const [checkOutOccurrence, setCheckOutOccurrence] = useState<"first" | "second">(initialCheckOutAt ? easternTimeOccurrence(initialCheckOutAt) : "first");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function saveSessionTimes() {
    setIsSaving(true);
    setFeedback("");
    setError("");

    const checkIn = parseEasternDateTimeInput(checkInAt, initialCheckInAt, checkInOccurrence);
    const checkOut = parseEasternDateTimeInput(checkOutAt, initialCheckOutAt, checkOutOccurrence);
    if (!checkIn || !checkOut) {
      setError("Enter valid Eastern times. Times skipped by daylight saving are invalid.");
      setIsSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/attendance/manual-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId,
          checkInAt: checkIn.toISOString(),
          checkOutAt: checkOut.toISOString(),
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
      <p className="mb-2 text-sm font-medium text-slate-700">Manually set session times (Eastern)</p>
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
          <label htmlFor={`check-in-occurrence-${bookingId}`} className="form-label text-xs">If the time repeats during the fall clock change</label>
          <select id={`check-in-occurrence-${bookingId}`} value={checkInOccurrence} onChange={(event) => setCheckInOccurrence(event.target.value === "second" ? "second" : "first")} className="form-input py-2 text-sm">
            <option value="first">First occurrence (EDT)</option>
            <option value="second">Second occurrence (EST)</option>
          </select>
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
          <label htmlFor={`check-out-occurrence-${bookingId}`} className="form-label text-xs">If the time repeats during the fall clock change</label>
          <select id={`check-out-occurrence-${bookingId}`} value={checkOutOccurrence} onChange={(event) => setCheckOutOccurrence(event.target.value === "second" ? "second" : "first")} className="form-input py-2 text-sm">
            <option value="first">First occurrence (EDT)</option>
            <option value="second">Second occurrence (EST)</option>
          </select>
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