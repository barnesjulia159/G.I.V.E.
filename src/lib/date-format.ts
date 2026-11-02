export const DISPLAY_TIME_ZONE = "UTC";

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
    return `${startDate}, ${timeFormatter.format(start)}-${timeFormatter.format(end)} ${startZone}`;
  }

  return `${startDate}, ${timeFormatter.format(start)} - ${endDate}, ${timeFormatter.format(end)} ${startZone}`;
}