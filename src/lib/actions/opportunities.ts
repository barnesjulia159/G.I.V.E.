"use server";

import { redirect } from "next/navigation";
import { invalidateOpportunityViews } from "@/lib/opportunity-cache";
import { requireNonprofitOrganization } from "@/lib/authorization";
import { OpportunityStatus } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import {
  hasMinimumOpportunityDescription,
  hasValidOpportunityLocation,
  MIN_OPPORTUNITY_DESCRIPTION_LENGTH,
} from "@/lib/opportunity-validation";
import { formatDate, formatDateTimeRange } from "@/lib/date-format";

function getOpportunityPayload(formData: FormData, status: OpportunityStatus) {
  const startAt = String(formData.get("start_at") || "");
  const endAt = String(formData.get("end_at") || "");

  return {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    location_name: String(formData.get("location_name") || "").trim(),
    address_line1: String(formData.get("address_line1") || "").trim(),
    address_line2: String(formData.get("address_line2") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    state: String(formData.get("state") || "").trim(),
    zip_code: String(formData.get("zip_code") || "").trim(),
    start_at: startAt,
    end_at: endAt,
    capacity: Number(formData.get("capacity") || 0),
    minimum_age: formData.get("minimum_age")
      ? Number(formData.get("minimum_age"))
      : null,
    is_virtual: formData.get("is_virtual") === "true",
    accessibility_notes: String(formData.get("accessibility_notes") || "").trim(),
    requirements: String(formData.get("requirements") || "").trim(),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
  };
}

async function notifyVolunteersOfPublishedOpportunity({
  senderId,
  opportunityId,
  title,
  startAt,
  endAt,
  location,
}: {
  senderId: string;
  opportunityId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
}) {
  try {
    const volunteers = await prisma.profile.findMany({
      where: { role: "volunteer", isActive: true },
      select: { id: true },
    });

    if (!volunteers.length) return true;

    const message = [
      `${title} is now available to book.`,
      `Date and time: ${formatDateTimeRange(startAt, endAt)}`,
      `Location: ${location || "Location TBD"}`,
    ].join("\n");

    await prisma.notification.createMany({
      data: volunteers.map((volunteer) => ({
        sender_id: senderId,
        recipient_id: volunteer.id,
        opportunity_id: opportunityId,
        type: "opportunity_published",
        title: "New volunteer opportunity",
        message,
        status: "sent" as const,
      })),
    });
    return true;
  } catch (error) {
    console.error("Failed to notify volunteers of published opportunity", error);
    return false;
  }
}

export async function createOpportunity(formData: FormData) {
  const { supabase, user, organization } = await requireNonprofitOrganization();

  const submitAction = String(formData.get("submit_action") || "draft");
  const status: OpportunityStatus = submitAction === "publish" ? "published" : "draft";

  const payload = {
    ...getOpportunityPayload(formData, status),
    organization_id: organization.id,
    created_by: user.id,
  };

  if (!payload.title || !payload.description || !payload.start_at || !payload.end_at || !Number.isSafeInteger(payload.capacity) || payload.capacity <= 0) {
    redirect("/nonprofit/opportunities/new?error=Title, description, start time, end time, and capacity are required.");
  }

  if (status === "published" && !hasMinimumOpportunityDescription(payload.description)) {
    redirect(`/nonprofit/opportunities/new?error=${encodeURIComponent(`Published opportunities need a description of at least ${MIN_OPPORTUNITY_DESCRIPTION_LENGTH} characters.`)}`);
  }

  if (status === "published" && !hasValidOpportunityLocation({
    isVirtual: payload.is_virtual,
    locationName: payload.location_name,
    addressLine1: payload.address_line1,
    city: payload.city,
  })) {
    redirect("/nonprofit/opportunities/new?error=Add a venue, street address, or city, or mark the event as remote before publishing.");
  }

  const skillIds = [...new Set(formData.getAll("skill_ids").map(String))];
  const causeIds = [...new Set(formData.getAll("cause_ids").map(String))];
  const [{ data: selectedSkills, error: skillsError }, { data: selectedCauses, error: causesError }] = await Promise.all([
    skillIds.length ? supabase.from("skills").select("id").in("id", skillIds) : Promise.resolve({ data: [], error: null }),
    causeIds.length ? supabase.from("causes").select("id").in("id", causeIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (skillsError || causesError || selectedSkills?.length !== skillIds.length || selectedCauses?.length !== causeIds.length) {
    redirect("/nonprofit/opportunities/new?error=Please select valid skills and causes.");
  }

  const { data: createdOpportunity, error } = await supabase
    .from("opportunities")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    redirect(`/nonprofit/opportunities/new?error=${encodeURIComponent(error.message)}`);
  }

  if (createdOpportunity) {
    invalidateOpportunityViews(createdOpportunity.id);
    const [{ error: skillLinkError }, { error: causeLinkError }] = await Promise.all([
      skillIds.length
        ? supabase.from("opportunity_skills").insert(skillIds.map((skillId) => ({ opportunity_id: createdOpportunity.id, skill_id: skillId })))
        : Promise.resolve({ error: null }),
      causeIds.length
        ? supabase.from("opportunity_causes").insert(causeIds.map((causeId) => ({ opportunity_id: createdOpportunity.id, cause_id: causeId })))
        : Promise.resolve({ error: null }),
    ]);
    if (skillLinkError || causeLinkError) {
      console.error("Failed to save opportunity skills or causes", skillLinkError, causeLinkError);
      redirect("/nonprofit/dashboard?error=Opportunity created, but skills or causes could not be saved.");
    }
  }

  if (status === "published" && createdOpportunity) {
    const notified = await notifyVolunteersOfPublishedOpportunity({
      senderId: user.id,
      opportunityId: createdOpportunity.id,
      title: payload.title,
      startAt: payload.start_at,
      endAt: payload.end_at,
      location: [payload.location_name, payload.city, payload.state].filter(Boolean).join(", "),
    });
    if (!notified) {
      redirect("/nonprofit/dashboard?error=Opportunity published, but volunteer notifications could not be sent.");
    }
  }

  redirect("/nonprofit/dashboard?message=Opportunity created.");
}

export async function updateOpportunity(formData: FormData) {
  const { supabase, user, organization } = await requireNonprofitOrganization();
  const opportunityId = String(formData.get("opportunity_id") || "");
  const submitAction = String(formData.get("submit_action") || "draft");

  if (!opportunityId) {
    redirect("/nonprofit/dashboard?error=Missing opportunity ID.");
  }

  const status: OpportunityStatus =
    submitAction === "publish"
      ? "published"
      : submitAction === "close"
        ? "closed"
        : "draft";

  const payload = getOpportunityPayload(formData, status);

  if (!Number.isSafeInteger(payload.capacity) || payload.capacity <= 0) {
    redirect(`/nonprofit/opportunities/${opportunityId}/edit?error=Capacity must be a positive integer.`);
  }

  if (status === "published" && !hasMinimumOpportunityDescription(payload.description)) {
    redirect(`/nonprofit/opportunities/${opportunityId}/edit?error=${encodeURIComponent(`Published opportunities need a description of at least ${MIN_OPPORTUNITY_DESCRIPTION_LENGTH} characters.`)}`);
  }

  if (status === "published" && !hasValidOpportunityLocation({
    isVirtual: payload.is_virtual,
    locationName: payload.location_name,
    addressLine1: payload.address_line1,
    city: payload.city,
  })) {
    redirect(`/nonprofit/opportunities/${opportunityId}/edit?error=${encodeURIComponent("Add a venue, street address, or city, or mark the event as remote before publishing.")}`);
  }

  const { data: previousOpportunity, error: lookupError } = await supabase
    .from("opportunities")
    .select("id, title, status, start_at, end_at, location_name, city, state")
    .eq("id", opportunityId)
    .eq("organization_id", organization.id)
    .eq("is_deleted", false)
    .maybeSingle();

  if (lookupError || !previousOpportunity) {
    redirect("/nonprofit/dashboard?error=Opportunity not found or access denied.");
  }

  const { data: updatedOpportunity, error } = await supabase
    .from("opportunities")
    .update(payload)
    .eq("id", opportunityId)
    .eq("organization_id", organization.id)
    .eq("is_deleted", false)
    .select("id, title, status, start_at, end_at, location_name, city, state")
    .maybeSingle();

  if (error) {
    redirect(`/nonprofit/opportunities/${opportunityId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  if (!updatedOpportunity) {
    redirect("/nonprofit/dashboard?error=Opportunity not found or access denied.");
  }
  invalidateOpportunityViews(updatedOpportunity.id);

  const becamePublished = previousOpportunity.status !== "published" && updatedOpportunity.status === "published";
  const previousLocation = [
    previousOpportunity?.location_name,
    previousOpportunity?.city,
    previousOpportunity?.state,
  ]
    .filter(Boolean)
    .join(", ");
  const updatedLocation = [updatedOpportunity.location_name, updatedOpportunity.city, updatedOpportunity.state]
    .filter(Boolean)
    .join(", ");
  const dateChanged =
    previousOpportunity &&
    formatDate(previousOpportunity.start_at) !== formatDate(updatedOpportunity.start_at);
  const timeChanged =
    previousOpportunity &&
    (previousOpportunity.start_at !== updatedOpportunity.start_at ||
      previousOpportunity.end_at !== updatedOpportunity.end_at);
  const locationChanged = previousLocation !== updatedLocation;
  const scheduleChanged =
    previousOpportunity?.status === "published" &&
    updatedOpportunity.status === "published" &&
    (dateChanged || timeChanged || locationChanged);

  if (becamePublished) {
    const notified = await notifyVolunteersOfPublishedOpportunity({
      senderId: user.id,
      opportunityId,
      title: updatedOpportunity.title,
      startAt: updatedOpportunity.start_at,
      endAt: updatedOpportunity.end_at,
      location: updatedLocation,
    });
    if (!notified) {
      redirect("/nonprofit/dashboard?error=Opportunity published, but volunteer notifications could not be sent.");
    }
  } else if (scheduleChanged) {
    const bookings = await prisma.booking.findMany({
      where: {
        opportunity_id: opportunityId,
        opportunity: { organization_id: organization.id, organization: { user_id: user.id } },
        status: { not: "cancelled" },
      },
      select: { volunteer_id: true },
    });

    if (bookings.length) {
      const changes = [
        dateChanged ? "Date changed." : null,
        timeChanged ? "Time changed." : null,
        locationChanged ? "Location changed." : null,
      ]
        .filter(Boolean)
        .join(" ");
      const updatedDetails = [
        `${updatedOpportunity.title} has been updated. ${changes}`,
        `Updated date and time: ${formatDateTimeRange(updatedOpportunity.start_at, updatedOpportunity.end_at)}`,
        `Updated location: ${updatedLocation || "Location TBD"}`,
        "Please review your booking details and update your plans accordingly.",
      ].join("\n");

      await prisma.notification.createMany({
        data: bookings.map((booking) => ({
          sender_id: user.id,
          recipient_id: booking.volunteer_id,
          opportunity_id: opportunityId,
          type: "schedule_updated",
          title: "Volunteer schedule updated",
          message: updatedDetails,
          status: "sent" as const,
        })),
      });
    }
  }

  redirect("/nonprofit/dashboard?message=Opportunity updated.");
}

export async function archiveOpportunity(formData: FormData) {
  const { supabase, organization } = await requireNonprofitOrganization();
  const opportunityId = String(formData.get("opportunity_id") || "");

  if (!opportunityId) {
    redirect("/nonprofit/dashboard?error=Missing opportunity ID.");
  }

  const { data: archivedOpportunity, error } = await supabase
    .from("opportunities")
    .update({
      status: "archived",
      is_deleted: true,
    })
    .eq("id", opportunityId)
    .eq("organization_id", organization.id)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();

  if (error) {
    redirect(`/nonprofit/dashboard?error=${encodeURIComponent(error.message)}`);
  }
  if (!archivedOpportunity) {
    redirect("/nonprofit/dashboard?error=Opportunity not found or access denied.");
  }
  invalidateOpportunityViews(archivedOpportunity.id);

  redirect("/nonprofit/dashboard?message=Opportunity archived.");
}
