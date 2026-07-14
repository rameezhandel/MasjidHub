import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';

/**
 * Content (prayer times, announcements, events) may be managed by any member
 * of the masjid — admins and maintainers alike — or by the platform admin.
 * User/masjid administration has stricter rules enforced in its own services.
 */
export function assertMasjidMember(actor: AuthUser, masjidId: string): void {
  if (actor.role === UserRole.PLATFORM_ADMIN) {
    return;
  }
  if (actor.masjidId === masjidId) {
    return;
  }
  throw new ForbiddenException('You do not have access to this masjid');
}
