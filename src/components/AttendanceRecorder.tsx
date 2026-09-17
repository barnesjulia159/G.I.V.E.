"use client";

import { useState } from "react";
import { Toast } from "@/components/Toast";

const statuses = [
  ["present", "Present"],
  ["absent", "Absent"],
  ["excused", "Excused"],
  ["no_show", "No show"],
] as const;

type AttendanceRecorderProps = {
  bookingId: string;
  initialStatus?: string;
};

export function AttendanceRecorder({ bookingId, initialStatus = "" }: AttendanceRecorderProps) {
  const [status, setStatus] = useState(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function saveAttendance() {
    setIsSaving(true);
    setFeedback("");
    setError("");

    try {
      const response = await fetch("/api/attendance/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setError(result?.message ?? "Unable to record attendance.");
        return;
      }

      setFeedback("Attendance recorded.");
    } catch {
      setError("Unable to record attendance.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {feedback && <Toast message={feedback} variant="success" onDismiss={() => setFeedback("")} />}
      {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
      <label htmlFor={`attendance-${bookingId}`} className="sr-only">
        Attendance status
      </label>
      <select
        id={`attendance-${bookingId}`}
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="form-input w-auto py-2 text-sm"
      >
        <option value="">Record attendance</option>
        {statuses.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={saveAttendance}
        disabled={!status || isSaving}
        className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {isSaving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
