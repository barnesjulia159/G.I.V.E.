import { DISPLAY_TIME_ZONE, formatDate, formatDateTime, formatDateTimeRange } from "@/lib/date-format";

export function LocalDateTime({
  value,
  end,
  dateOnly = false,
}: {
  value: Date | string;
  end?: Date | string;
  dateOnly?: boolean;
}) {
  if (end) return formatDateTimeRange(value, end, DISPLAY_TIME_ZONE);
  return dateOnly ? formatDate(value, DISPLAY_TIME_ZONE) : formatDateTime(value, DISPLAY_TIME_ZONE);
}
