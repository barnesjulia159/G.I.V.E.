export const MIN_OPPORTUNITY_DESCRIPTION_LENGTH = 50;

export function hasMinimumOpportunityDescription(description: string) {
  return description.trim().length >= MIN_OPPORTUNITY_DESCRIPTION_LENGTH;
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
  return isVirtual || [locationName, addressLine1, city].some((value) => value.trim().length > 0);
}