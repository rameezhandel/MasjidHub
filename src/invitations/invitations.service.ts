import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, MasjidStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService, AuthTokens } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, PaginationQueryDto, paginated } from '../common/dto/pagination.dto';
import { Env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto } from './dto/invitation.dto';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

/** API shape: no token hash, plus a computed status. */
export interface InvitationView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  masjidId: string;
  invitedById: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  status: InvitationStatus;
}

export function toInvitationView(invitation: Invitation): InvitationView {
  const status: InvitationStatus = invitation.acceptedAt
    ? 'ACCEPTED'
    : invitation.expiresAt < new Date()
      ? 'EXPIRED'
      : 'PENDING';
  return {
    id: invitation.id,
    email: invitation.email,
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    role: invitation.role,
    masjidId: invitation.masjidId,
    invitedById: invitation.invitedById,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt,
    status,
  };
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<Env, true>,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    actor: AuthUser,
    masjidId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationView> {
    this.assertCanManageInvitations(actor, masjidId);

    const masjid = await this.prisma.masjid.findUnique({ where: { id: masjidId } });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (masjid.status !== MasjidStatus.ACTIVE) {
      throw new ConflictException('Invitations require an active masjid');
    }

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const token = randomBytes(48).toString('base64url');
    const ttlDays = this.configService.get('INVITATION_TTL_DAYS', { infer: true });
    const [, invitation] = await this.prisma.$transaction([
      // One outstanding invitation per email — re-inviting replaces the old link.
      this.prisma.invitation.deleteMany({ where: { email, acceptedAt: null } }),
      this.prisma.invitation.create({
        data: {
          email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: dto.role,
          masjidId,
          invitedById: actor.id,
          tokenHash: AuthService.hashToken(token),
          expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const baseUrl = this.configService.get('APP_BASE_URL', { infer: true });
    const inviteUrl = `${baseUrl.replace(/\/$/, '')}/accept-invite?token=${token}`;
    await this.mailService.sendInvitationEmail(email, inviteUrl, masjid.name, ttlDays);

    await this.auditService.record({
      action: AuditAction.INVITATION_CREATED,
      actorId: actor.id,
      actorEmail: actor.email,
      masjidId,
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email, role: dto.role },
    });
    return toInvitationView(invitation);
  }

  async findAll(
    actor: AuthUser,
    masjidId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<InvitationView>> {
    this.assertCanManageInvitations(actor, masjidId);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invitation.findMany({
        where: { masjidId },
        skip: query.skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invitation.count({ where: { masjidId } }),
    ]);
    return paginated(data.map(toInvitationView), total, query);
  }

  async revoke(actor: AuthUser, masjidId: string, id: string): Promise<void> {
    this.assertCanManageInvitations(actor, masjidId);
    const invitation = await this.prisma.invitation.findFirst({ where: { id, masjidId } });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.acceptedAt) {
      throw new ConflictException('Invitation has already been accepted');
    }
    await this.prisma.invitation.delete({ where: { id } });
    await this.auditService.record({
      action: AuditAction.INVITATION_REVOKED,
      actorId: actor.id,
      actorEmail: actor.email,
      masjidId,
      targetType: 'invitation',
      targetId: id,
      metadata: { email: invitation.email },
    });
  }

  /** Public: invitee sets their own password and is logged in immediately. */
  async accept(token: string, password: string): Promise<AuthTokens> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: AuthService.hashToken(token) },
      include: { masjid: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }
    if (invitation.masjid.status !== MasjidStatus.ACTIVE) {
      throw new ConflictException('This masjid is not active');
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await AuthService.hashPassword(password);
    const [user] = await this.prisma.$transaction([
      this.prisma.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          role: invitation.role,
          masjidId: invitation.masjidId,
        },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    await this.auditService.record({
      action: AuditAction.INVITATION_ACCEPTED,
      actorId: user.id,
      actorEmail: user.email,
      masjidId: invitation.masjidId,
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { role: invitation.role },
    });
    return this.authService.sessionFor(user.id);
  }

  /** Same rule as user management: platform admin anywhere, masjid admin at home. */
  private assertCanManageInvitations(actor: AuthUser, masjidId: string): void {
    if (actor.role === UserRole.PLATFORM_ADMIN) {
      return;
    }
    if (actor.role === UserRole.MASJID_ADMIN && actor.masjidId === masjidId) {
      return;
    }
    throw new ForbiddenException('You do not have access to manage invitations of this masjid');
  }
}
