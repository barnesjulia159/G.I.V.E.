import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const limit = Math.min(
    Math.max(
      Number.parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE,
      1
    ),
    MAX_PAGE_SIZE
  );
  const unread = ["true", "1"].includes(
    (url.searchParams.get("unread") ?? "").toLowerCase()
  );

  const where = {
    recipient_id: user.id,
    ...(unread ? { read_at: null } : {}),
  };

  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return NextResponse.json({
    data: notifications,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const recipientId = typeof body?.recipientId === "string" ? body.recipientId : user.id;
  const type = typeof body?.type === "string" ? body.type.trim() : "general";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!title || !message) {
    return NextResponse.json(
      { message: "title and message are required" },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (recipientId !== user.id && profile?.role !== "admin") {
    return NextResponse.json(
      { message: "Only admins can create notifications for other users" },
      { status: 403 }
    );
  }

  const notification = await prisma.notification.create({
    data: {
      recipient_id: recipientId,
      booking_id: typeof body?.bookingId === "string" ? body.bookingId : null,
      opportunity_id:
        typeof body?.opportunityId === "string" ? body.opportunityId : null,
      type,
      title,
      message,
    },
  });

  return NextResponse.json(notification, { status: 201 });
}
