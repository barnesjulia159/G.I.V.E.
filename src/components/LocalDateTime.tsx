"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, formatDateTimeRange } from "@/lib/date-format";

const subscribe = () => () => {};
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

export function LocalDateTime({
  value,
  end,
  dateOnly = false,
}: {
  value: Date | string;
  end?: Date | string;
  dateOnly?: boolean;
}) {
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
  if (end) return formatDateTimeRange(value, end, timeZone);
  return dateOnly ? formatDate(value, timeZone) : formatDateTime(value, timeZone);
}
