"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";

type HoursOverrideControlProps = {
  bookingId: string;
  volunteerId: string;
  opportunityId: string;
  currentHours: number;
  hoursOverride: number | null;
};

export function HoursOverrideControl({
  bookingId,
  volunteerId,
  opportunityId,
  currentHours,
  hoursOverride,
}: HoursOverrideControlProps) {
  const [hours, setHours] = useState(String(hoursOverride ?? currentHours));
  const [activeOverride, setActiveOverride] = useState(hoursOverride);
  const [effectiveHours, setEffectiveHours] = useState(currentHours);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function saveOverride(value: number | null) {
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      const response = await fetch("/api/attendance/hours/override", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, hours: value, notes }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.message ?? "Unable to update logged hours.");
        return;
      }

      setActiveOverride(value);
      setEffectiveHours(value ?? currentHours);
      setFeedback(value === null ? "Hours override cleared." : "Logged hours overridden.");
      if (value === null) setHours(String(currentHours));
      setNotes("");
      try {
        const channel = new BroadcastChannel("attendance-updates");
        channel.postMessage({ type: "hours-overridden", volunteerId, opportunityId });
        channel.close();
      } catch {
        console.warn("BroadcastChannel not supported");
      }
    } catch {
      setError("Unable to update logged hours.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {feedback && <Toast message={feedback} variant="success" onDismiss={() => setFeedback("")} />}
      {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
      <p className="mb-2 text-sm text-slate-600">
        Current logged total: <strong>{effectiveHours.toFixed(2)} hours</strong>
        {activeOverride !== null && <span className="ml-1 text-emerald-700">(overridden)</span>}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`override-hours-${bookingId}`} className="form-label text-xs">
            Set event total (hours)
          </label>
          <input
            id={`override-hours-${bookingId}`}
            type="number"
            min="0"
            max="24"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className="form-input w-36 py-2 text-sm"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`override-notes-${bookingId}`} className="form-label text-xs">
            Override note
          </label>
          <input
            id={`override-notes-${bookingId}`}
            value={notes}
            maxLength={1000}
            onChange={(event) => setNotes(event.target.value)}
            className="form-input py-2 text-sm"
            placeholder="Optional reason for adjustment"
          />
        </div>
        <button
          type="button"
          onClick={() => saveOverride(Number(hours))}
          disabled={!hours.trim() || !Number.isFinite(Number(hours)) || isSaving}
          className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Override hours"}
        </button>
        {activeOverride !== null && (
          <button
            type="button"
            onClick={() => saveOverride(null)}
            disabled={isSaving}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Clear override
          </button>
        )}
      </div>
    </div>
  );
}