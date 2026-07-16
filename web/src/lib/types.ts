export type UserRole = 'PLATFORM_ADMIN' | 'MASJID_ADMIN' | 'MASJID_MAINTAINER';
export type MasjidStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

export const CALCULATION_METHODS = [
  'MUSLIM_WORLD_LEAGUE',
  'ISNA',
  'EGYPTIAN',
  'UMM_AL_QURA',
  'KARACHI',
  'DUBAI',
  'KUWAIT',
  'QATAR',
  'SINGAPORE',
  'TURKEY',
  'MOON_SIGHTING_COMMITTEE',
] as const;
export type CalculationMethod = (typeof CALCULATION_METHODS)[number];
export type AsrMethod = 'STANDARD' | 'HANAFI';

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  masjidId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Masjid {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  calculationMethod: CalculationMethod;
  asrMethod: AsrMethod;
  status: MasjidStatus;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export type PublicMasjid = Pick<
  Masjid,
  | 'id'
  | 'name'
  | 'slug'
  | 'email'
  | 'phone'
  | 'website'
  | 'addressLine1'
  | 'addressLine2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'timezone'
  | 'latitude'
  | 'longitude'
>;

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: SafeUser;
}

export interface PrayerTimetableEntry {
  id: string;
  masjidId: string;
  date: string;
  fajr: string;
  fajrIqamah: string | null;
  dhuhr: string;
  dhuhrIqamah: string | null;
  asr: string;
  asrIqamah: string | null;
  maghrib: string;
  maghribIqamah: string | null;
  isha: string;
  ishaIqamah: string | null;
  jumuah1: string | null;
  jumuah2: string | null;
}

export interface Announcement {
  id: string;
  masjidId: string;
  title: string;
  body: string;
  status: ContentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MasjidEvent {
  id: string;
  masjidId: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export type HouseholdStatus = 'ACTIVE' | 'INACTIVE' | 'MOVED_OUT';
export type Gender = 'MALE' | 'FEMALE';

export interface HouseholdMember {
  id: string;
  householdId: string;
  firstName: string;
  lastName: string;
  relationship: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Household {
  id: string;
  masjidId: string;
  familyName: string;
  headName: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  status: HouseholdStatus;
  members?: HouseholdMember[];
  _count?: { members: number };
  createdAt: string;
  updatedAt: string;
}

export interface HouseholdSummary {
  total: number;
  active: number;
  inactive: number;
  movedOut: number;
  members: number;
}

export interface Invitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  masjidId: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  status: InvitationStatus;
}

export interface AuditLog {
  id: string;
  action: string;
  actorEmail: string | null;
  masjidId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
