export const MIN_OPPORTUNITY_DESCRIPTION_LENGTH = 50;

export function hasMinimumOpportunityDescription(description: string) {
  return description.trim().length >= MIN_OPPORTUNITY_DESCRIPTION_LENGTH;
}

export function hasValidOpportunitySchedule(startAt: string, endAt: string) {
  const validTimestamp = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const calendarDate = value.slice(0, 10);
    const date = new Date(`${calendarDate}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === calendarDate;
  };
  return validTimestamp(startAt) && validTimestamp(endAt) && Date.parse(endAt) > Date.parse(startAt);
}

function providedLocation(value: string | null | undefined) {
  const location = value?.trim() ?? "";
  return location && !/^(tbd|to be determined|to be announced|n\/?a|unknown|location tbd)$/i.test(location)
    ? location : "";
}

export function hasValidOpportunityLocation({
  isVirtual,
  locationName,
  addressLine1,
  city,
}: {
  isVirtual: boolean;
  locationName: string;
  addressLine1: string;
  city: string;
}) {
  return isVirtual || [locationName, addressLine1, city].some((value) => Boolean(providedLocation(value)));
}

export function formatOpportunityLocation(opportunity: {
  is_virtual?: boolean;
  location_name?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
}) {
  if (opportunity.is_virtual) return "Virtual";
  return [
    providedLocation(opportunity.location_name) || providedLocation(opportunity.address_line1),
    providedLocation(opportunity.city),
    providedLocation(opportunity.state),
  ].filter(Boolean).join(", ") || "Location not provided. Contact the organization for details.";
}