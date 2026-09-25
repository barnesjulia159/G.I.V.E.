import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  updateVolunteerAvailability,
  updateVolunteerBio,
  updateVolunteerContact,
  updateVolunteerProfilePhoto,
} from "@/lib/actions/profiles";
import { AVAILABILITY_DAYS } from "@/lib/types";
import { SubmitButton } from "@/components/SubmitButton";
import { VolunteerSkillsAndCausesEditor } from "@/components/VolunteerSkillsAndCausesEditor";

type DayAvailability = { am: boolean; pm: boolean };
type WeekAvailability = Record<(typeof AVAILABILITY_DAYS)[number], DayAvailability>;

function parseAvailability(raw: string | null): WeekAvailability {
  const empty = Object.fromEntries(
    AVAILABILITY_DAYS.map((day) => [day, { am: false, pm: false }])
  ) as WeekAvailability;

  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    for (const day of AVAILABILITY_DAYS) {
      empty[day] = {
        am: Boolean(parsed?.[day]?.am),
        pm: Boolean(parsed?.[day]?.pm),
      };
    }
    return empty;
  } catch {
    return empty;
  }
}



function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { title: "Profile" };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { displayName: true },
  });

  return {
    title: profile ? `${profile.displayName} | Profile` : "Profile",
  };
}

type ProfilePageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const { error, message } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
  });

  if (!profile) {
    notFound();
  }

  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    profile.displayName ||
    "Profile";

  const location = [
    profile.city,
    profile.state,
    profile.zipCode,
  ]
    .filter(Boolean)
    .join(", ");

  const availability = parseAvailability(profile.availabilityNotes);

  return (
    <section className="dashboard-container">
      <div className="space-y-6">
        <section className="profile-card overflow-hidden p-0">
          <div className="h-32 bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600" />

          <div className="px-6 pb-8 sm:px-10">
            <div className="-mt-14 flex flex-col gap-5 sm:flex-row sm:items-end">
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt={`${fullName} profile photo`}
                  className="profile-avatar shrink-0 border-white object-cover shadow-md"
                />
              ) : (
                <div className="profile-avatar shrink-0 border-white bg-slate-900 font-bold text-white shadow-md">
                  {getInitials(fullName) || "P"}
                </div>
              )}

              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="profile-name tracking-tight">
                    {fullName}
                  </h1>

                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      profile.isActive
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-200 text-slate-700",
                    ].join(" ")}
                  >
                    {profile.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {profile.displayName !== fullName && (
                  <p className="mt-1 text-sm text-slate-500">
                    {profile.displayName}
                  </p>
                )}

                <p className="profile-role mt-2">
                  {formatLabel(profile.role)}
                  {location ? ` · ${location}` : ""}
                </p>
              </div>

              <div
                className={[
                  "w-fit rounded-full px-4 py-2 text-sm font-semibold",
                  profile.approvalStatus === "approved"
                    ? "bg-emerald-100 text-emerald-800"
                    : profile.approvalStatus === "rejected"
                      ? "bg-rose-100 text-rose-800"
                      : "bg-amber-100 text-amber-800",
                ].join(" ")}
              >
              </div>

              
            </div>
          </div>
        </section>

        <div className="profile-grid">
          <div className="space-y-6">
            <ProfileSection title="About">
              <form action={updateVolunteerBio} className="space-y-4">
                <div className="form-field">
                  <label htmlFor="bio" className="form-label">
                    Bio
                  </label>
                  <textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile.bio ?? ""}
                    className="form-input min-h-28"
                  />
                </div>

                <SubmitButton>Save bio</SubmitButton>
              </form>
            </ProfileSection>

            <ProfileSection title="Availability">
              <form action={updateVolunteerAvailability} className="space-y-4">
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Weekly availability schedule"
                  tabIndex={0}
                >
                <table className="w-full text-left text-sm" aria-label="Availability by day and time">
                  <thead>
                    <tr>
                      <th scope="col" className="pb-2 font-semibold text-slate-600">Day</th>
                      <th scope="col" className="pb-2 font-semibold text-slate-600">AM</th>
                      <th scope="col" className="pb-2 font-semibold text-slate-600">PM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AVAILABILITY_DAYS.map((day) => (
                      <tr key={day} className="border-t border-slate-100">
                        <td className="py-2 capitalize text-slate-700">{day}</td>
                        <td className="py-2">
                          <input
                            type="checkbox"
                            name={`${day}_am`}
                            aria-label={`${day} morning availability`}
                            defaultChecked={availability[day].am}
                            className="size-4"
                          />
                        </td>
                        <td className="py-2">
                          <input
                            type="checkbox"
                            name={`${day}_pm`}
                            aria-label={`${day} afternoon availability`}
                            defaultChecked={availability[day].pm}
                            className="size-4"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>

                <SubmitButton>Save availability</SubmitButton>
              </form>
            </ProfileSection>

            <ProfileSection title="Skills & Causes">
              <VolunteerSkillsAndCausesEditor />
            </ProfileSection>
          </div>

          <div className="space-y-6">
            <ProfileSection title="Profile photo">
              <form action={updateVolunteerProfilePhoto} className="space-y-4">
                <div className="form-field">
                  <label htmlFor="avatar_url" className="form-label">
                    Image URL
                  </label>
                  <input
                    id="avatar_url"
                    name="avatar_url"
                    type="url"
                    defaultValue={profile.avatarUrl ?? ""}
                    placeholder="https://example.com/profile-photo.jpg"
                    className="form-input"
                  />
                </div>

                <SubmitButton>Save profile photo</SubmitButton>
              </form>
            </ProfileSection>

            <ProfileSection title="Contact">
              {message && <p className="alert-info mb-4">{message}</p>}
              {error && <p className="alert-error mb-4">{error}</p>}

              <form action={updateVolunteerContact} className="space-y-4">
                <div className="form-field">
                  <label htmlFor="phone" className="form-label">
                    Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    defaultValue={profile.phone ?? ""}
                    className="form-input"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="city" className="form-label">
                    City
                  </label>
                  <input
                    id="city"
                    name="city"
                    defaultValue={profile.city ?? ""}
                    className="form-input"
                  />
                </div>

                <div className="grid gap-4 grid-cols-2">
                  <div className="form-field">
                    <label htmlFor="state" className="form-label">
                      State
                    </label>
                    <input
                      id="state"
                      name="state"
                      defaultValue={profile.state ?? ""}
                      className="form-input"
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="zip_code" className="form-label">
                      Zip Code
                    </label>
                    <input
                      id="zip_code"
                      name="zip_code"
                      defaultValue={profile.zipCode ?? ""}
                      className="form-input"
                    />
                  </div>
                </div>

                <SubmitButton>Save contact info</SubmitButton>
              </form>
            </ProfileSection>

            <ProfileSection title="Profile details">
              <dl className="space-y-4">
                <ProfileField
                  label="Role"
                  value={formatLabel(profile.role)}
                />

                <ProfileField
                  label="Approval"
                  value={formatLabel(profile.approvalStatus)}
                />

                <ProfileField
                  label="Member since"
                  value={formatDate(profile.createdAt)}
                />

                <ProfileField
                  label="Last updated"
                  value={formatDate(profile.updatedAt)}
                />
              </dl>
            </ProfileSection>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="profile-card">
      <h2 className="mb-5 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ProfileField({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1 text-sm text-slate-800">
        {value ? (
          href ? (
            <a
              href={href}
              className="text-blue-700 underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-slate-400">Not provided</span>
        )}
      </dd>
    </div>
  );
  
}
