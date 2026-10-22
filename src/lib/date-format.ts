export const DISPLAY_TIME_ZONE = "UTC";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

const timeZoneFormatter = new Intl.DateTimeFormat("en-US", {
  timeZoneName: "short",
  timeZone: DISPLAY_TIME_ZONE,
  hour: "numeric",
});

function asDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function getTimeZoneName(date: Date) {
  return timeZoneFormatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? DISPLAY_TIME_ZONE;
}

export function formatDate(value: Date | string) {
  return dateFormatter.format(asDate(value));
}

export function formatDateTime(value: Date | string) {
  const date = asDate(value);
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)} ${getTimeZoneName(date)}`;
}

export function formatDateTimeRange(startValue: Date | string, endValue: Date | string) {
  const start = asDate(startValue);
  const end = asDate(endValue);
  const startDate = dateFormatter.format(start);
  const endDate = dateFormatter.format(end);

  if (startDate === endDate) {
    return `${startDate}, ${timeFormatter.format(start)}-${timeFormatter.format(end)} ${getTimeZoneName(start)}`;
  }

  return `${startDate}, ${timeFormatter.format(start)} - ${endDate}, ${timeFormatter.format(end)} ${getTimeZoneName(start)}`;
}