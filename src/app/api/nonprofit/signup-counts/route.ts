import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "nonprofit") {
    return NextResponse.json({ message: "Only nonprofit accounts can view signup counts" }, { status: 403 });
  }

  const opportunities = await prisma.opportunity.findMany({
    where: { organization: { user_id: user.id }, is_deleted: false },
    select: { id: true },
  });
  const counts = Object.fromEntries(opportunities.map(({ id }) => [id, 0]));

  if (opportunities.length > 0) {
    const groupedBookings = await prisma.booking.groupBy({
      by: ["opportunity_id"],
      where: {
        opportunity_id: { in: opportunities.map(({ id }) => id) },
        status: { not: "cancelled" },
      },
      _count: { _all: true },
    });

    for (const group of groupedBookings) {
      counts[group.opportunity_id] = group._count._all;
    }
  }

  return NextResponse.json({ counts }, { headers: { "Cache-Control": "no-store" } });
}