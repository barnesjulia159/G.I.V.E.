import { UserRole } from "@/lib/types";

const DASHBOARD_PATHS: Record<UserRole, string> = {
  volunteer: "/volunteer/dashboard",
  nonprofit: "/nonprofit/dashboard",
  admin: "/admin/dashboard",
};

export function getDashboardPath(role: unknown): string | null {
  if (typeof role !== "string" || !(role in DASHBOARD_PATHS)) return null;
  return DASHBOARD_PATHS[role as UserRole];
}