import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { VolunteerHoursDashboard } from "@/components/VolunteerHoursDashboard";

export default function VolunteerHoursPage() {
  return (
    <RoleGate allowedRoles={["volunteer"]}>
      <section>
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Volunteer hours</h1>
              <p className="mt-2 text-slate-700">Track your check-ins, completed sessions, and service history.</p>
            </div>
            <Link href="/volunteer/bookings" className="text-sm font-medium text-emerald-700 hover:underline">My bookings</Link>
          </div>
        </div>
        <VolunteerHoursDashboard />
      </section>
    </RoleGate>
  );
}
