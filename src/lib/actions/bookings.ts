"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmationEmail } from "@/lib/email";

export async function createBooking(formData: FormData) {
  const opportunityId = String(formData.get("opportunity_id") || "");
  const notes = String(formData.get("notes") || "").trim();

  if (!opportunityId) {
    redirect("/opportunities?error=Missing opportunity ID.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunities")
    .select(
      "id, title, organization_id, start_at, end_at, location_name, city, state, is_virtual, requirements, accessibility_notes"
    )
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError || !opportunity) {
    redirect(`/opportunities/${opportunityId}?error=Opportunity not found.`);
  }

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      opportunity_id: opportunityId,
      volunteer_id: user.id,
      notes,
      status: "booked",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/opportunities/${opportunityId}?error=${encodeURIComponent(error.message)}`);
  }

  const startDate = new Date(opportunity.start_at);
  const endDate = new Date(opportunity.end_at);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
  const timeFormatter = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });
  const location = opportunity.is_virtual
    ? "Virtual"
    : [opportunity.location_name, opportunity.city, opportunity.state].filter(Boolean).join(", ") ||
      "Location to be confirmed";
  const confirmationDetails = [
    `Your registration for ${opportunity.title} is confirmed.`,
    `Date: ${dateFormatter.format(startDate)}`,
    `Time: ${timeFormatter.format(startDate)} - ${timeFormatter.format(endDate)}`,
    `Location: ${location}`,
    opportunity.requirements ? `Requirements: ${opportunity.requirements}` : null,
    opportunity.accessibility_notes
      ? `Accessibility: ${opportunity.accessibility_notes}`
      : null,
    "Next steps: Review your booking details and arrive prepared for the opportunity.",
  ].filter(Boolean).join("\n");

  const { data: organization } = await supabase
    .from("organizations")
    .select("user_id")
    .eq("id", opportunity.organization_id)
    .maybeSingle();

  const notifications = [
    {
      sender_id: user.id,
      recipient_id: user.id,
      booking_id: booking.id,
      opportunity_id: opportunity.id,
      type: "booking_confirmed",
      title: "Booking confirmed",
      message: confirmationDetails,
      status: "sent" as const,
    },
  ];

  if (organization?.user_id && organization.user_id !== user.id) {
    notifications.push({
      sender_id: user.id,
      recipient_id: organization.user_id,
      booking_id: booking.id,
      opportunity_id: opportunity.id,
      type: "booking_created",
      title: "New volunteer registration",
      message: `A volunteer registered for ${opportunity.title}.`,
      status: "sent" as const,
    });
  }

  await prisma.notification.createMany({ data: notifications });

  if (user.email) {
    try {
      await sendBookingConfirmationEmail({
        to: user.email,
        volunteerName:
          typeof user.user_metadata?.display_name === "string"
            ? user.user_metadata.display_name
            : user.email,
        opportunityTitle: opportunity.title,
        startAt: new Date(opportunity.start_at).toLocaleString(),
        location:
          [opportunity.location_name, opportunity.city, opportunity.state]
            .filter(Boolean)
            .join(", ") || "Location to be confirmed",
      });
    } catch (emailError) {
      console.error("Booking confirmation email failed:", emailError);
    }
  }

  redirect("/volunteer/bookings?message=You are booked for this opportunity.");
}

export async function cancelBooking(formData: FormData) {
  const bookingId = String(formData.get("booking_id") || "");

  if (!bookingId) {
    redirect("/volunteer/bookings?error=Missing booking ID.");
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (error) {
    redirect(`/volunteer/bookings?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/volunteer/bookings?message=Booking cancelled.");
}
