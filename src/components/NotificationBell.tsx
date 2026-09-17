"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Toast } from "@/components/Toast";

type NotificationItem = {
  id: string;
  opportunity_id: string | null;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

type NotificationsResponse = {
  data: NotificationItem[];
  pagination: { total: number };
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  async function loadNotifications() {
    setIsLoading(true);
    setError("");
    try {
      const [recentResponse, unreadResponse] = await Promise.all([
        fetch("/api/notifications?limit=8", { cache: "no-store" }),
        fetch("/api/notifications?unread=true&limit=1", { cache: "no-store" }),
      ]);
      if (!recentResponse.ok || !unreadResponse.ok) return;
      const result: NotificationsResponse = await recentResponse.json();
      const unreadResult: NotificationsResponse = await unreadResponse.json();
      setNotifications(result.data);
      setUnreadCount(unreadResult.pagination.total);
    } catch {
      setError("Notifications could not be refreshed.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);

    const refreshInterval = window.setInterval(loadNotifications, 30_000);
    const handleWindowFocus = () => loadNotifications();
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  async function markAsRead(notification: NotificationItem) {
    if (!notification.read_at) {
      const response = await fetch(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      if (!response.ok) {
        setError("Notification could not be marked as read.");
        return;
      }
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      {error && <Toast message={error} variant="error" onDismiss={() => setError("")} />}
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((open) => !open);
          if (!isOpen) loadNotifications();
        }}
        className="relative grid size-9 place-items-center rounded-md text-slate-700 hover:bg-slate-100 hover:text-emerald-700"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between px-2 pb-2">
            <h2 className="font-semibold text-slate-950">Notifications</h2>
            <Link href="/notifications" onClick={() => setIsOpen(false)} className="text-xs font-medium text-emerald-700 hover:underline">
              View all
            </Link>
          </div>

          {isLoading ? (
            <p className="p-3 text-sm text-slate-500">Loading...</p>
          ) : notifications.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No recent notifications.</p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg ${notification.read_at ? "" : "bg-emerald-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => markAsRead(notification)}
                    className="block w-full p-3 text-left hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 size-2 shrink-0 rounded-full ${notification.read_at ? "bg-slate-300" : "bg-emerald-600"}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">{notification.title}</span>
                        <span className="mt-1 block line-clamp-2 whitespace-pre-line text-xs text-slate-600">{notification.message}</span>
                      </span>
                    </div>
                  </button>
                  {notification.opportunity_id && (
                    <Link
                      href={`/opportunities/${notification.opportunity_id}`}
                      onClick={() => setIsOpen(false)}
                      className="block px-3 pb-3 pl-8 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      View opportunity and register
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
