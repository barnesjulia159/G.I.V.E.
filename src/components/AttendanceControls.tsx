"use client";

import { useEffect, useState } from "react";
import { Toast } from "@/components/Toast";

type AttendanceRecord = {
  check_in_at: string | null;
  check_out_at: string | null;
};

type AttendanceControlsProps = {
  bookingId: string;
};

export function AttendanceControls({ bookingId }: AttendanceControlsProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch(`/api/attendance/check-in?bookingId=${bookingId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => result && setAttendance(result))
      .catch(() => undefined);
  }, [bookingId]);

  async function submit(endpoint: "check-in" | "check-out") {
    setIsLoading(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/attendance/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.message ?? "Unable to update attendance.");
        return;
      }
      setAttendance(result);
      setFeedback(endpoint === "check-in" ? "Checked in successfully." : "Checked out successfully.");
      
      // Broadcast update to all pages/tabs so hours dashboard refreshes immediately
      try {
        const channel = new BroadcastChannel("attendance-updates");
        channel.postMessage({ type: "attendance-update", endpoint, bookingId });
        channel.close();
      } catch (error) {
        console.warn("BroadcastChannel not supported");
      }
    } catch {
      setError("Unable to update attendance.");
    } finally {
      setIsLoading(false);
    }
  }

  const isCheckedIn = Boolean(attendance?.check_in_at);
  const isCheckedOut = Boolean(attendance?.check_out_at);

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {feedback && (
        <Toast message={feedback} variant="success" onDismiss={() => setFeedback("")} />
      )}
      {error && (
        <Toast message={error} variant="error" onDismiss={() => setError("")} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!isCheckedIn && !isCheckedOut && (
          <button
            type="button"
            onClick={() => submit("check-in")}
            disabled={isLoading}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {isLoading ? "Updating..." : "Check in"}
          </button>
        )}
        {isCheckedIn && !isCheckedOut && (
          <button
            type="button"
            onClick={() => submit("check-out")}
            disabled={isLoading}
            className="rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
          >
            {isLoading ? "Updating..." : "Check out"}
          </button>
        )}
        {isCheckedOut && (
          <span className="text-sm font-medium text-emerald-700">Attendance complete</span>
        )}
      </div>
      {attendance && isCheckedIn && (
        <p className="mt-2 text-xs text-slate-500">
          Checked in at {new Date(attendance.check_in_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          {isCheckedOut && ` · checked out at ${new Date(attendance.check_out_at!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
        </p>
      )}
    </div>
  );
}
