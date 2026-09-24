"use client";

import { useEffect } from "react";

type ToastProps = {
  message: string;
  variant?: "success" | "error" | "info";
  onDismiss: () => void;
};

export function Toast({ message, variant = "info", onDismiss }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  }[variant];

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`fixed bottom-4 right-4 z-[100] flex max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${styles}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="font-bold opacity-70 hover:opacity-100"
      >
        x
      </button>
    </div>
  );
}
