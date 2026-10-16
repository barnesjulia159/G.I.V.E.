"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, RefreshCw } from "lucide-react";

export function ReportActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="report-actions">
      <button type="button" title="Refresh report" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        <RefreshCw size={16} aria-hidden="true" />
        {pending ? "Refreshing..." : "Refresh"}
      </button>
      <button type="button" title="Print event report" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" />
        Print report
      </button>
    </div>
  );
}