export const DISPLAY_TIME_ZONE = "America/New_York";

const easternInputFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function toEasternDateTimeInput(value: Date | string) {
  const parts = easternInputFormatter.formatToParts(asDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function parseEasternDateTimeInput(
  value: string,
  previousValue?: Date | string | null,
  occurrence: "first" | "second" = "first",
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const wallTime = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wallTime) || new Date(wallTime).toISOString().slice(0, 16) !== value) return null;

  // Both offsets around a DST transition are considered, including the repeated fall hour.
  const offsets = [-86400000, 86400000].map((delta) => {
    const instant = wallTime + delta;
    return Date.parse(`${toEasternDateTimeInput(new Date(instant))}:00Z`) - instant;
  });
  const matches = offsets
    .map((offset) => new Date(wallTime - offset))
    .filter((date) => toEasternDateTimeInput(date) === value)
    .sort((a, b) => a.getTime() - b.getTime());
  const selected = occurrence === "second" ? matches[matches.length - 1] : matches[0];
  if (!selected) return null;
  if (previousValue) {
    const previous = asDate(previousValue);
    if (previous.getTime() >= selected.getTime() && previous.getTime() < selected.getTime() + 60_000) return previous;
  }
  return selected;
}

export function easternTimeOccurrence(value: Date | string): "first" | "second" {
  const first = parseEasternDateTimeInput(toEasternDateTimeInput(value));
  return first && asDate(value).getTime() >= first.getTime() + 60_000 ? "second" : "first";
}

export function easternDayBounds(value: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const calendarDay = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== value) return null;
  calendarDay.setUTCDate(calendarDay.getUTCDate() + 1);
  const start = parseEasternDateTimeInput(`${value}T00:00`);
  const end = parseEasternDateTimeInput(`${calendarDay.toISOString().slice(0, 10)}T00:00`);
  return start && end ? { start, end } : null;
}

function formatters(timeZone: string) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });

  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  const timeZoneFormatter = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "short",
    timeZone,
    hour: "numeric",
  });
  return { dateFormatter, timeFormatter, timeZoneFormatter };
}

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function getTimeZoneName(date: Date, formatter: Intl.DateTimeFormat, timeZone: string) {
  return formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export function formatDate(value: Date | string, timeZone = DISPLAY_TIME_ZONE) {
  const { dateFormatter } = formatters(timeZone);
  return dateFormatter.format(asDate(value));
}

export function formatDateTime(value: Date | string, timeZone = DISPLAY_TIME_ZONE) {
  const { dateFormatter, timeFormatter, timeZoneFormatter } = formatters(timeZone);
  const date = asDate(value);
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)} ${getTimeZoneName(date, timeZoneFormatter, timeZone)}`;
}

export function formatDateTimeRange(startValue: Date | string, endValue: Date | string, timeZone = DISPLAY_TIME_ZONE) {
  const { dateFormatter, timeFormatter, timeZoneFormatter } = formatters(timeZone);
  const start = asDate(startValue);
  const end = asDate(endValue);
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);
  const startZone = getTimeZoneName(start, timeZoneFormatter, timeZone);
  const endZone = getTimeZoneName(end, timeZoneFormatter, timeZone);
  if (startZone !== endZone) {
    return `${startDate}, ${timeFormatter.format(start)} ${startZone} - ${endDate}, ${timeFormatter.format(end)} ${endZone}`;
  }

  if (startDate === endDate) {
    return `${startDate}, ${timeFormatter.format(start)} - ${timeFormatter.format(end)} ${startZone}`;
  }

  return `${startDate}, ${timeFormatter.format(start)} - ${endDate}, ${timeFormatter.format(end)} ${startZone}`;
}