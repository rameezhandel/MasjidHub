import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MasjidStatus, Prisma, UserRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { SafeUser, toSafeUser } from '../common/utils/safe-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMasjidUserDto } from './dto/create-masjid-user.dto';
import { QueryMasjidUsersDto } from './dto/query-masjid-users.dto';
import { UpdateMasjidUserDto } from './dto/update-masjid-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(actor: AuthUser, masjidId: string, dto: CreateMasjidUserDto): Promise<SafeUser> {
    this.assertTenantAccess(actor, masjidId);
    const masjid = await this.getMasjidOrThrow(masjidId);
    if (masjid.status === MasjidStatus.ARCHIVED) {
      throw new ConflictException('Cannot add users to an archived masjid');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await AuthService.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        masjidId,
      },
    });
    return toSafeUser(user);
  }

  async findAll(
    actor: AuthUser,
    masjidId: string,
    query: QueryMasjidUsersDto,
  ): Promise<PaginatedResult<SafeUser>> {
    this.assertTenantAccess(actor, masjidId);
    await this.getMasjidOrThrow(masjidId);

    const where: Prisma.UserWhereInput = {
      masjidId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginated(users.map(toSafeUser), total, query);
  }

  async findOne(actor: AuthUser, masjidId: string, userId: string): Promise<SafeUser> {
    this.assertTenantAccess(actor, masjidId);
    const user = await this.prisma.user.findFirst({ where: { id: userId, masjidId } });
    if (!user) {
      throw new NotFoundException('User not found in this masjid');
    }
    return toSafeUser(user);
  }

  async update(
    actor: AuthUser,
    masjidId: string,
    userId: string,
    dto: UpdateMasjidUserDto,
  ): Promise<SafeUser> {
    this.assertTenantAccess(actor, masjidId);
    const target = await this.prisma.user.findFirst({ where: { id: userId, masjidId } });
    if (!target) {
      throw new NotFoundException('User not found in this masjid');
    }

    const demoting =
      dto.role !== undefined &&
      dto.role !== UserRole.MASJID_ADMIN &&
      target.role === UserRole.MASJID_ADMIN;
    const deactivating = dto.isActive === false && target.isActive;

    if ((demoting || deactivating) && target.role === UserRole.MASJID_ADMIN) {
      const otherActiveAdmins = await this.prisma.user.count({
        where: {
          masjidId,
          role: UserRole.MASJID_ADMIN,
          isActive: true,
          id: { not: userId },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new ConflictException('Cannot demote or deactivate the last active masjid admin');
      }
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data: dto });

    // Losing privileges or access should take effect immediately.
    if (demoting || deactivating) {
      await this.authService.revokeAllSessions(userId);
    }
    return toSafeUser(updated);
  }

  private assertTenantAccess(actor: AuthUser, masjidId: string): void {
    if (actor.role === UserRole.PLATFORM_ADMIN) {
      return;
    }
    if (actor.role === UserRole.MASJID_ADMIN && actor.masjidId === masjidId) {
      return;
    }
    throw new ForbiddenException('You do not have access to manage users of this masjid');
  }

  private async getMasjidOrThrow(masjidId: string): Promise<{ status: MasjidStatus }> {
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { status: true },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    return masjid;
  }
}
