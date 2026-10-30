import { revalidatePath } from "next/cache";

export function invalidateOpportunityViews(opportunityId: string) {
  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opportunityId}`);
  revalidatePath("/nonprofit/dashboard");
  revalidatePath("/volunteer/bookings");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/nonprofit/opportunities/${opportunityId}/edit`);
  revalidatePath(`/nonprofit/opportunities/${opportunityId}/participants`);
  revalidatePath("/nonprofit/reports");
  revalidatePath("/volunteer/dashboard");
  revalidatePath("/admin/bookings");
}
