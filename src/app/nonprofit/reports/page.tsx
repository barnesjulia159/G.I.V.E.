import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportActions } from "@/components/ReportActions";
import { buildEventReport } from "@/lib/event-report";
import { prisma } from "@/lib/prisma";
import { getDashboardPath } from "@/lib/role-routing";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatDateTimeRange } from "@/lib/date-format";
import styles from "./reports.module.css";

const hoursFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatReportDateTime = (date: Date | null) => date ? formatDateTime(date) : "Not recorded";
const formatStatus = (status: string) => status.replaceAll("_", " ");

export default async function ReportsPage({ searchParams }: {
  searchParams: Promise<{ event?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id }, select: { role: true, isActive: true },
  });
  if (!profile?.isActive) redirect("/login");
  if (profile.role !== "nonprofit") redirect(getDashboardPath(profile.role) ?? "/login");

  const organization = await prisma.organization.findUnique({
    where: { user_id: user.id }, select: { id: true, name: true },
  });
  if (!organization) {
    return (
      <section className={styles.report}>
        <h1>Tracking &amp; Reports</h1>
        <p>No organization profile has been created.</p>
        <Link href="/nonprofit/organization">Create Organization Profile</Link>
      </section>
    );
  }

  const events = await prisma.opportunity.findMany({
    where: { organization_id: organization.id, is_deleted: false },
    orderBy: { start_at: "desc" },
    select: { id: true, title: true, start_at: true, end_at: true, status: true, location_name: true, city: true, is_virtual: true },
  });
  const params = await searchParams;
  const event = params.event ? events.find((item) => item.id === params.event) : events[0];
  if (params.event && !event) notFound();

  if (!event) {
    return (
      <section className={styles.report}>
        <h1>Tracking &amp; Reports</h1>
        <p>No events are available for reporting.</p>
        <Link href="/nonprofit/opportunities/new">Create Opportunity</Link>
      </section>
    );
  }

  const [bookings, manualEntries] = await Promise.all([
    prisma.booking.findMany({
      where: {
        opportunity_id: event.id, opportunity: { organization: { user_id: user.id } },
        status: { not: "cancelled" },
      },
      orderBy: { booked_at: "asc" },
      select: {
        id: true, volunteer_id: true, status: true, hours_override: true, hours_override_notes: true, notes: true,
        attendanceLog: { select: { status: true, check_in_at: true, check_out_at: true, notes: true } },
      },
    }),
    prisma.volunteer_hours.findMany({
      where: { opportunity_id: event.id, opportunities: { organization: { user_id: user.id } } },
      select: { volunteer_id: true, hours: true, notes: true },
    }),
  ]);
  const volunteerIds = [...new Set([...bookings, ...manualEntries].map((entry) => entry.volunteer_id))];
  const profiles = await prisma.profile.findMany({
    where: { id: { in: volunteerIds } },
    select: { id: true, displayName: true, firstName: true, lastName: true, email: true, phone: true },
  });
  const report = buildEventReport(bookings, manualEntries, profiles);

  return (
    <section className={styles.report}>
      <div className={styles.screenOnly}>
        <Link href="/nonprofit/dashboard">Back to dashboard</Link>
        <div className={styles.heading}>
          <h1>Tracking &amp; Reports</h1>
          <ReportActions />
        </div>
        <form className={styles.filters} action="/nonprofit/reports">
          <div>
            <label htmlFor="report-event">Event</label>
            <select id="report-event" name="event" defaultValue={event.id} key={event.id}>
              {events.map((item) => <option key={item.id} value={item.id}>{item.title} ({formatDate(item.start_at)})</option>)}
            </select>
          </div>
          <button type="submit">View report</button>
          <Link href={`/nonprofit/opportunities/${event.id}/participants`}>Manage attendance</Link>
        </form>
      </div>

      <div className={styles.eventHeader}>
        <p className={styles.organization}>{organization.name}</p>
        <h2>{event.title}</h2>
        <p>{formatDateTimeRange(event.start_at, event.end_at)}</p>
        <p>{event.is_virtual ? "Virtual event" : [event.location_name, event.city].filter(Boolean).join(", ") || "Location not specified"}</p>
        <p className={styles.metadata}>Event status: {formatStatus(event.status)} | Generated {formatReportDateTime(new Date())}</p>
      </div>

      <dl className={styles.totals}>
        <div><dt>Volunteers</dt><dd>{report.volunteerCount}</dd></div>
        <div><dt>Currently checked in</dt><dd>{report.checkedInCount}</dd></div>
        <div><dt>Total tracked hours</dt><dd>{hoursFormatter.format(report.totalHours)}</dd></div>
      </dl>

      {report.rows.length === 0 ? <p className={styles.empty}>No volunteers or tracked hours for this event.</p> : (
        <div className={styles.tableScroll} role="region" aria-label="Volunteer hours report" tabIndex={0}>
          <table>
            <caption>Volunteer attendance and hours (UTC)</caption>
            <thead><tr>
              <th scope="col">Volunteer</th><th scope="col">Attendance</th>
              <th scope="col">Check-in / Check-out</th><th scope="col">Hours breakdown</th><th scope="col">Total hours</th>
            </tr></thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.volunteerId}>
                  <th scope="row">
                    <strong>{row.name}</strong>
                    <span>{row.email ?? "Email not provided"}</span>
                    <span>{row.phone ?? "Phone not provided"}</span>
                  </th>
                  <td>{row.sessions.length ? row.sessions.map((session) => (
                    <div key={session.id} className={styles.session}>
                      <span>{session.attendanceLog ? formatStatus(session.attendanceLog.status) : "Not recorded"}</span>
                      <small>Booking: {formatStatus(session.status)}</small>
                    </div>
                  )) : "Manual entry only"}</td>
                  <td>{row.sessions.length ? row.sessions.map((session) => (
                    <div key={session.id} className={styles.session}>
                        <span>In: {formatReportDateTime(session.attendanceLog?.check_in_at ?? null)}</span>
                        <span>Out: {formatReportDateTime(session.attendanceLog?.check_out_at ?? null)}</span>
                    </div>
                  )) : "Not recorded"}</td>
                  <td>
                    <span>Attendance: {hoursFormatter.format(row.attendanceHours)}</span>
                    <span>Manual: {hoursFormatter.format(row.manualHours)}</span>
                    {row.overrideHours !== null && <span>Override: {hoursFormatter.format(row.overrideHours)}</span>}
                    {row.notes.map((note, index) => <p className={styles.notes} key={index}>{note}</p>)}
                  </td>
                  <td className={styles.number}>{hoursFormatter.format(row.totalHours)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><th scope="row" colSpan={4}>Total tracked hours</th><td className={styles.number}>{hoursFormatter.format(report.totalHours)}</td></tr></tfoot>
          </table>
        </div>
      )}
    </section>
  );
}