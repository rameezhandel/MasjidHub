import { UserRole } from '@prisma/client';

/** Authenticated principal attached to each request by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  masjidId: string | null;
}

/** Claims carried inside the access token. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  masjidId: string | null;
}
