"use client";

import { useEffect, useState } from "react";

type HoursEntry = {
  id: string;
  bookingId: string | null;
  opportunityTitle: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  recordedAt: string;
  hours: number;
  status: string;
  source: "attendance" | "manual";
  notes: string | null;
};

type HoursResponse = { data: HoursEntry[]; totalHours: number };

type ActiveBooking = {
  id: string;
  opportunityTitle: string;
  checkInAt: string | null;
  checkOutAt: string | null;
};

export function VolunteerHoursDashboard() {
  const [result, setResult] = useState<HoursResponse>({ data: [], totalHours: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeBookings, setActiveBookings] = useState<ActiveBooking[]>([]);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchHours = async () => {
    try {
      const response = await fetch("/api/attendance/hours", { cache: "no-store" });
      const data = response.ok ? await response.json() : { data: [], totalHours: 0 };
      setResult(data);
      setLastUpdated(new Date());
      
      // Extract active bookings for quick actions
      const active = data.data
        .filter((entry: HoursEntry) => entry.source === "attendance" && entry.checkInAt && !entry.checkOutAt)
        .map((entry: HoursEntry) => ({
          id: entry.bookingId!,
          opportunityTitle: entry.opportunityTitle,
          checkInAt: entry.checkInAt,
          checkOutAt: entry.checkOutAt,
        }));
      setActiveBookings(active);
    } catch (error) {
      console.error("Failed to fetch hours:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleCheckIn = async (bookingId: string) => {
    setActionLoading((prev) => ({ ...prev, [bookingId]: true }));
    try {
      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (response.ok) {
        await fetchHours();
        // Broadcast update to other pages/tabs
        try {
          const channel = new BroadcastChannel("attendance-updates");
          channel.postMessage({ type: "attendance-update", action: "check-in", bookingId });
          channel.close();
        } catch (error) {
          console.warn("BroadcastChannel not supported");
        }
      }
    } catch (error) {
      console.error("Check-in failed:", error);
    } finally {
      setActionLoading((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const handleCheckOut = async (bookingId: string) => {
    setActionLoading((prev) => ({ ...prev, [bookingId]: true }));
    try {
      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (response.ok) {
        await fetchHours();
        // Broadcast update to other pages/tabs
        try {
          const channel = new BroadcastChannel("attendance-updates");
          channel.postMessage({ type: "attendance-update", action: "check-out", bookingId });
          channel.close();
        } catch (error) {
          console.warn("BroadcastChannel not supported");
        }
      }
    } catch (error) {
      console.error("Check-out failed:", error);
    } finally {
      setActionLoading((prev) => ({ ...prev, [bookingId]: false }));
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchHours();
  };

  useEffect(() => {
    fetchHours();
    // Poll every 3 seconds to reflect check-in/check-out and manual hour updates
    const interval = setInterval(fetchHours, 3000);
    
    // Listen for cross-page/tab updates from bookings or nonprofit pages
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("attendance-updates");
      channel.onmessage = (event) => {
        if (event.data?.type === "attendance-update" || event.data?.type === "hours-recorded") {
          fetchHours();
        }
      };
    } catch (error) {
      console.warn("BroadcastChannel not supported, falling back to polling");
    }
    
    // Refresh when tab becomes visible (user navigates back to this page)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchHours();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      clearInterval(interval);
      channel?.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const byOpportunity = result.data.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.opportunityTitle] = (totals[entry.opportunityTitle] ?? 0) + entry.hours;
    return totals;
  }, {});

  return (
    <div className="mt-6 space-y-6">
      {/* Header with refresh button and last updated */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-600">
          {lastUpdated ? (
            <>
              Last updated: <span className="font-medium">{lastUpdated.toLocaleTimeString()}</span>
              {isRefreshing && <span className="ml-2 inline-block animate-spin">⟳</span>}
            </>
          ) : (
            <span>Loading...</span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Active bookings with quick check-in/check-out */}
      {activeBookings.length > 0 && (
        <section className="rounded-xl bg-amber-50 p-5">
          <h2 className="mb-3 text-lg font-semibold text-amber-900">Active Sessions</h2>
          <div className="space-y-3">
            {activeBookings.map((booking) => (
              <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4">
                <div>
                  <p className="font-medium text-slate-900">{booking.opportunityTitle}</p>
                  <p className="text-sm text-slate-600">Checked in: {booking.checkInAt ? new Date(booking.checkInAt).toLocaleTimeString() : "—"}</p>
                </div>
                <button
                  onClick={() => handleCheckOut(booking.id)}
                  disabled={actionLoading[booking.id]}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading[booking.id] ? "Checking out..." : "Check out"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-emerald-50 p-5">
          <p className="text-sm font-medium text-emerald-800">Total hours</p>
          <p className="mt-2 text-3xl font-bold text-emerald-900">{result.totalHours.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-5">
          <p className="text-sm font-medium text-slate-600">Completed sessions</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{result.data.filter((entry) => entry.hours > 0).length}</p>
        </div>
        <div className="rounded-xl bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-800">In progress</p>
          <p className="mt-2 text-3xl font-bold text-amber-900">{result.data.filter((entry) => entry.checkInAt && !entry.checkOutAt).length}</p>
        </div>
      </div>

      {/* Hours by opportunity */}
      <section>
        <h2 className="text-xl font-semibold">Hours by opportunity</h2>
        {Object.keys(byOpportunity).length === 0 ? (
          <p className="mt-3 rounded-xl bg-white p-5 text-slate-600">No logged hours yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="px-5 py-3">Opportunity</th>
                  <th className="px-5 py-3">Hours</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byOpportunity).map(([title, hours]) => (
                  <tr key={title} className="border-b">
                    <td className="px-5 py-3 font-medium">{title}</td>
                    <td className="px-5 py-3">{hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Attendance history */}
      <section>
        <h2 className="text-xl font-semibold">Attendance history</h2>
        {isLoading ? (
          <p className="mt-3 text-slate-500">Loading attendance...</p>
        ) : result.data.length === 0 ? (
          <p className="mt-3 rounded-xl bg-white p-5 text-slate-600">Your check-in history will appear here.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {result.data.map((entry) => (
              <article key={entry.id} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{entry.opportunityTitle}</h3>
                    <p className="text-xs capitalize text-slate-500">{entry.source} hours</p>
                  </div>
                  <span className="font-medium text-emerald-700">{entry.hours.toFixed(2)} hours</span>
                </div>
                {entry.source === "attendance" ? (
                  <>
                    <p className="mt-2 text-sm text-slate-600">Checked in: {entry.checkInAt ? new Date(entry.checkInAt).toLocaleString() : "Not checked in"}</p>
                    <p className="text-sm text-slate-600">Checked out: {entry.checkOutAt ? new Date(entry.checkOutAt).toLocaleString() : "Not checked out"}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">Recorded: {new Date(entry.recordedAt).toLocaleString()}</p>
                )}
                {entry.notes && <p className="mt-2 text-sm text-slate-600">Note: {entry.notes}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
