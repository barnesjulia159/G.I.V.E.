import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { AVAILABILITY_DAYS } from "@/lib/types";

function parseSkillsAndCauses(raw: string | null): {
  skills: string[];
  causes: string[];
} {
  if (!raw) return { skills: [], causes: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      causes: Array.isArray(parsed.causes) ? parsed.causes : [],
    };
  } catch {
    return { skills: [], causes: [] };
  }
}

function parseAvailability(raw: string | null) {
  const days: { day: string; am: boolean; pm: boolean }[] = [];
  let parsed: Record<string, { am?: boolean; pm?: boolean }> = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  for (const day of AVAILABILITY_DAYS) {
    days.push({
      day,
      am: Boolean(parsed[day]?.am),
      pm: Boolean(parsed[day]?.pm),
    });
  }
  return days;
}

export default async function VolunteerDashboardPage() {
  return (
    <RoleGate allowedRoles={["volunteer"]}>
      <VolunteerDashboardContent />
    </RoleGate>
  );
}

async function VolunteerDashboardContent() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, first_name, bio, availability_notes, phone, city, state, zip_code, skillsAndCauses"
    )
    .eq("id", user!.id)
    .single();

  const { count: activeBookingCount } = await supabase
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("volunteer_id", user!.id)
    .eq("status", "booked");

  const displayName =
    profile?.display_name || profile?.first_name || user?.email || "Volunteer";

  const location = [profile?.city, profile?.state, profile?.zip_code]
    .filter(Boolean)
    .join(", ");

  const { skills, causes } = parseSkillsAndCauses(profile?.skillsAndCauses ?? null);
  const availability = parseAvailability(profile?.availability_notes ?? null);
  const availableDays = availability.filter((d) => d.am || d.pm);

  return (
    <section className="volunteer-dashboard">
      <header className="volunteer-dashboard-welcome">
        <div>
          <p className="volunteer-dashboard-eyebrow">VOLUNTEER OVERVIEW</p>
          <h1>Welcome back, {displayName}</h1>
          <p className="volunteer-dashboard-intro">
            Find your next opportunity, keep track of your commitments, and update your profile.
          </p>
        </div>
        <div className="volunteer-dashboard-header-actions">
          <Link href="/opportunities" className="volunteer-dashboard-primary">
            Explore opportunities
          </Link>
          <form action={signOut}>
            <button type="submit" className="dashboard-signout">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="volunteer-dashboard-actions" aria-label="Quick actions">
        <div className="volunteer-booking-stat">
          <Link href="/volunteer/bookings">Active bookings</Link>
          <strong>{activeBookingCount ?? 0}</strong>
          <span>Upcoming volunteer commitments</span>
        </div>

        <Link href="/opportunities" className="volunteer-action-link">
          <span className="volunteer-action-icon" aria-hidden="true">＋</span>
          <span>
            <strong>Find opportunities</strong>
            <small>Browse ways to help in your community</small>
          </span>
          <span className="volunteer-action-arrow" aria-hidden="true">→</span>
        </Link>

        <Link href="/volunteer/profile" className="volunteer-action-link">
          <span className="volunteer-action-icon" aria-hidden="true">↗</span>
          <span>
            <strong>Edit your profile</strong>
            <small>Keep your details and availability current</small>
          </span>
          <span className="volunteer-action-arrow" aria-hidden="true">→</span>
        </Link>

        <Link href="/volunteer/hours" className="volunteer-action-link">
          <span className="volunteer-action-icon" aria-hidden="true">◷</span>
          <span>
            <strong>Volunteer hours</strong>
            <small>Review your recorded service time</small>
          </span>
          <span className="volunteer-action-arrow" aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="volunteer-dashboard-details" aria-label="Your profile summary">
        <article className="volunteer-summary-panel volunteer-bio-panel">
          <p className="volunteer-panel-eyebrow">YOUR PROFILE</p>
          <h2>About you</h2>
          <p className="volunteer-bio-copy">
            {profile?.bio || "Add a short introduction to help organizations get to know you."}
          </p>
        </article>

        <article className="volunteer-summary-panel">
          <p className="volunteer-panel-eyebrow">CONTACT</p>
          <h2>Contact details</h2>
          <dl className="volunteer-summary-list">
            <div>
              <dt>Phone</dt>
              <dd>{profile?.phone || "Not provided"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{location || "Not provided"}</dd>
            </div>
          </dl>
        </article>

        <article className="volunteer-summary-panel">
          <p className="volunteer-panel-eyebrow">WHEN YOU CAN HELP</p>
          <h2>Availability</h2>
          {availableDays.length === 0 ? (
            <p className="volunteer-empty-summary">No availability set yet.</p>
          ) : (
            <ul className="volunteer-availability-list">
              {availableDays.map(({ day, am, pm }) => (
                <li key={day}>
                  <span>{day}</span>
                  <span>{[am && "AM", pm && "PM"].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="volunteer-summary-panel">
          <p className="volunteer-panel-eyebrow">YOUR INTERESTS</p>
          <h2>Skills &amp; causes</h2>
          {skills.length === 0 && causes.length === 0 ? (
            <p className="volunteer-empty-summary">No skills or causes added yet.</p>
          ) : (
            <div className="volunteer-interest-groups">
              {skills.length > 0 && (
                <div>
                  <h3>Skills</h3>
                  <ul className="volunteer-interest-list">
                    {skills.map((skill) => <li key={skill}>{skill}</li>)}
                  </ul>
                </div>
              )}
              {causes.length > 0 && (
                <div>
                  <h3>Causes</h3>
                  <ul className="volunteer-interest-list">
                    {causes.map((cause) => <li key={cause}>{cause}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </article>
      </section>
    </section>
  );
}
