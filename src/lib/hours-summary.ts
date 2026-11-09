export function groupHoursByOpportunity(entries: readonly {
  opportunityId: string;
  opportunityTitle: string;
  hours: number;
  verificationPending?: boolean;
}[]) {
  const groups = new Map<string, { id: string; title: string; hours: number; pendingApproval: boolean }>();
  for (const entry of entries) {
    const existing = groups.get(entry.opportunityId);
    if (existing) {
      existing.hours += entry.hours;
      existing.pendingApproval ||= entry.verificationPending === true;
    }
    else groups.set(entry.opportunityId, {
      id: entry.opportunityId, title: entry.opportunityTitle, hours: entry.hours, pendingApproval: entry.verificationPending === true,
    });
  }
  return [...groups.values()];
}
