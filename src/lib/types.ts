export type UserRole = "volunteer" | "nonprofit" | "admin";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OpportunityStatus = "draft" | "published" | "closed" | "archived";

export type BookingStatus =
  | "booked"
  | "cancelled"
  | "waitlisted"
  | "completed"
  | "no_show";

export type AttendanceStatus = "present" | "absent" | "excused" | "no_show";

export const AVAILABILITY_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Profile = {
  id: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  bio: string | null;
  availability_notes: string | null;
  approval_status: ApprovalStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  user_id: string;
  name: string;
  mission_statement: string;
  description: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  is_approved: boolean;
  created_at: string;
  updated_at: string;
};

export type Opportunity = {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  description: string;
  location_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  minimum_age: number | null;
  accessibility_notes: string | null;
  requirements: string | null;
  status: OpportunityStatus;
  is_virtual: boolean;
  is_deleted: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicOpportunityListing = {
  id: string;
  title: string;
  description: string;
  location_name: string | null;
  city: string | null;
  state: string | null;
  start_at: string;
  end_at: string;
  capacity: number;
  minimum_age: number | null;
  accessibility_notes: string | null;
  requirements: string | null;
  is_virtual: boolean;
  organization_name: string;
  organization_id: string;
  booked_count: number;
  spots_remaining: number;
};

export type Booking = {
  id: string;
  opportunity_id: string;
  volunteer_id: string;
  status: BookingStatus;
  notes: string | null;
  booked_at: string;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BookingWithOpportunity = Booking & {
  opportunities: Opportunity & {
    organizations: Pick<Organization, "name"> | null;
  } | null;
};

export type AdminPlatformSummary = {
  total_users: number;
  total_volunteers: number;
  total_nonprofits: number;
  pending_organizations: number;
  published_opportunities: number;
  active_bookings: number;
  total_attendance_records: number;
};

