"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";

type ManualHoursRecorderProps = {
  volunteerId: string;
  opportunityId: string;
};

export function ManualHoursRecorder({ volunteerId, opportunityId }: ManualHoursRecorderProps) {
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function saveHours() {
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      const response = await fetch("/api/attendance/hours/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerId, opportunityId, hours, notes }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.message ?? "Unable to record volunteer hours.");
        return;
      }
      setHours("");
      setNotes("");
      setFeedback("Volunteer hours recorded.");
      
      // Broadcast update to all pages/tabs so hours dashboard refreshes immediately
      try {
        const channel = new BroadcastChannel("attendance-updates");
        channel.postMessage({ type: "hours-recorded", volunteerId, opportunityId });
        channel.close();
      } catch (error) {
        console.warn("BroadcastChannel not supported");
      }
    } catch {
      setError("Unable to record volunteer hours.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {feedback && <Toast message={feedback} variant="success" onDismiss={() => setFeedback("")} />}
      {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`hours-${volunteerId}-${opportunityId}`} className="form-label text-xs">
            Manual hours
          </label>
          <input
            id={`hours-${volunteerId}-${opportunityId}`}
            type="number"
            min="0.01"
            max="24"
            step="0.25"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            className="form-input w-28 py-2 text-sm"
            placeholder="Hours"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`hours-notes-${volunteerId}-${opportunityId}`} className="form-label text-xs">
            Notes
          </label>
          <input
            id={`hours-notes-${volunteerId}-${opportunityId}`}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="form-input py-2 text-sm"
            placeholder="Optional note"
          />
        </div>
        <button
          type="button"
          onClick={saveHours}
          disabled={!hours || isSaving}
          className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Add hours"}
        </button>
      </div>
    </div>
  );
}
