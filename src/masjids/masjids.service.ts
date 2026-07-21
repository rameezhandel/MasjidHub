import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Masjid, MasjidStatus, Prisma, User, UserRole } from '@prisma/client';
import { AuditAction } from '../audit/audit-actions';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { SafeUser, toSafeUser } from '../common/utils/safe-user';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMasjidDto } from './dto/create-masjid.dto';
import { QueryMasjidsDto } from './dto/query-masjids.dto';
import { UpdateMasjidDto } from './dto/update-masjid.dto';

export type MasjidWithUserCount = Masjid & { _count: { users: number } };

@Injectable()
export class MasjidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Platform admin onboards a masjid together with its initial admin. */
  async create(dto: CreateMasjidDto, actor: AuthUser): Promise<Masjid & { admin: SafeUser }> {
    const adminEmail = dto.admin.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      // A user belongs to at most one masjid. Reuse an existing account only when it
      // isn't tied to any masjid yet; otherwise reassigning it would be destructive.
      if (existingUser.role === UserRole.PLATFORM_ADMIN) {
        throw new ConflictException(
          'This email belongs to a platform administrator and cannot be a masjid admin.',
        );
      }
      if (existingUser.masjidId) {
        throw new ConflictException(
          'This user already belongs to another masjid. Use a different email, or remove them from their current masjid first.',
        );
      }
    }

    let slug: string;
    if (dto.slug) {
      const taken = await this.prisma.masjid.findUnique({ where: { slug: dto.slug } });
      if (taken) {
        throw new ConflictException('A masjid with this slug already exists');
      }
      slug = dto.slug;
    } else {
      slug = await this.generateUniqueSlug(dto.name);
    }

    const { admin, slug: _ignored, ...masjidData } = dto;

    let masjidRecord: Masjid;
    let adminUser: User;

    if (existingUser) {
      // Attach the existing (unassigned) account as this masjid's admin, keeping its
      // current credentials. Atomic so a failure can't leave an admin-less masjid.
      const { created, attached } = await this.prisma.$transaction(async (tx) => {
        const m = await tx.masjid.create({ data: { ...masjidData, slug } });
        const u = await tx.user.update({
          where: { id: existingUser.id },
          data: { masjidId: m.id, role: UserRole.MASJID_ADMIN, isActive: true },
        });
        return { created: m, attached: u };
      });
      masjidRecord = created;
      adminUser = attached;
    } else {
      const passwordHash = await AuthService.hashPassword(admin.password);
      const masjid = await this.prisma.masjid.create({
        data: {
          ...masjidData,
          slug,
          users: {
            create: {
              email: adminEmail,
              passwordHash,
              firstName: admin.firstName,
              lastName: admin.lastName,
              role: UserRole.MASJID_ADMIN,
            },
          },
        },
        include: { users: true },
      });
      const { users, ...rest } = masjid;
      masjidRecord = rest;
      adminUser = users[0];
    }

    await this.auditService.record({
      action: AuditAction.MASJID_CREATED,
      actorId: actor.id,
      actorEmail: actor.email,
      masjidId: masjidRecord.id,
      targetType: 'masjid',
      targetId: masjidRecord.id,
      metadata: {
        name: masjidRecord.name,
        slug: masjidRecord.slug,
        adminEmail,
        reusedExistingUser: Boolean(existingUser),
      },
    });
    return { ...masjidRecord, admin: toSafeUser(adminUser) };
  }

  async findAll(query: QueryMasjidsDto): Promise<PaginatedResult<MasjidWithUserCount>> {
    const where: Prisma.MasjidWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.masjid.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { users: true } } },
      }),
      this.prisma.masjid.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  /** Platform admin can read any masjid; tenant users only their own. */
  async findOne(id: string, actor: AuthUser): Promise<MasjidWithUserCount> {
    if (actor.role !== UserRole.PLATFORM_ADMIN && actor.masjidId !== id) {
      throw new ForbiddenException('You do not have access to this masjid');
    }
    const masjid = await this.prisma.masjid.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    return masjid;
  }

  /** Platform admin can update any masjid; a masjid admin only their own. */
  async update(id: string, dto: UpdateMasjidDto, actor: AuthUser): Promise<Masjid> {
    if (actor.role !== UserRole.PLATFORM_ADMIN && actor.masjidId !== id) {
      throw new ForbiddenException('You do not have access to this masjid');
    }
    const masjid = await this.prisma.masjid.findUnique({ where: { id } });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (dto.slug && dto.slug !== masjid.slug) {
      const taken = await this.prisma.masjid.findUnique({ where: { slug: dto.slug } });
      if (taken) {
        throw new ConflictException('A masjid with this slug already exists');
      }
    }
    return this.prisma.masjid.update({ where: { id }, data: dto });
  }

  /**
   * Platform admin activates/suspends/archives a masjid. Leaving ACTIVE
   * immediately revokes every session of the masjid's users.
   */
  async setStatus(id: string, status: MasjidStatus, actor: AuthUser): Promise<Masjid> {
    const masjid = await this.prisma.masjid.findUnique({ where: { id } });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (masjid.status === status) {
      return masjid;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.masjid.update({ where: { id }, data: { status } }),
      ...(status !== MasjidStatus.ACTIVE
        ? [
            this.prisma.refreshToken.updateMany({
              where: { user: { masjidId: id }, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]
        : []),
    ]);
    await this.auditService.record({
      action: AuditAction.MASJID_STATUS_CHANGED,
      actorId: actor.id,
      actorEmail: actor.email,
      masjidId: id,
      targetType: 'masjid',
      targetId: id,
      metadata: { from: masjid.status, to: status },
    });
    return updated;
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.masjid.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
