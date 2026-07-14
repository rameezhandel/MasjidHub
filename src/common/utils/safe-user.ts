import { User, UserRole } from '@prisma/client';

/** User representation that is safe to return from the API (no password hash). */
export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  masjidId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    masjidId: user.masjidId,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
