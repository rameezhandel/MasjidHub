import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Household, HouseholdMember, HouseholdStatus, MasjidStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHouseholdMemberDto, UpdateHouseholdMemberDto } from './dto/household-member.dto';
import { CreateHouseholdDto, QueryHouseholdsDto, UpdateHouseholdDto } from './dto/household.dto';
import { QueryMembersDto } from './dto/member-search.dto';

/** API shape: dateOfBirth is a plain YYYY-MM-DD string, not a timestamp. */
export type HouseholdMemberView = Omit<HouseholdMember, 'dateOfBirth'> & {
  dateOfBirth: string | null;
};

/** A member paired with just enough of its household to link back to it. */
export type MemberSearchView = HouseholdMemberView & {
  household: { id: string; familyName: string; headName: string; status: HouseholdStatus };
};
export type HouseholdView = Household & {
  members?: HouseholdMemberView[];
  _count?: { members: number };
};

export function toMemberView(member: HouseholdMember): HouseholdMemberView {
  return { ...member, dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? null };
}

function memberCreateData(dto: CreateHouseholdMemberDto) {
  return {
    firstName: dto.firstName,
    lastName: dto.lastName,
    relationship: dto.relationship,
    gender: dto.gender,
    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
    phone: dto.phone,
    email: dto.email,
  };
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, masjidId: string, dto: CreateHouseholdDto): Promise<HouseholdView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const { members, ...household } = dto;
    const created = await this.prisma.household.create({
      data: {
        ...household,
        masjidId,
        createdById: actor.id,
        ...(members?.length ? { members: { create: members.map(memberCreateData) } } : {}),
      },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
    return { ...created, members: created.members.map(toMemberView) };
  }

  async findAll(
    actor: AuthUser,
    masjidId: string,
    query: QueryHouseholdsDto,
  ): Promise<PaginatedResult<HouseholdView>> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);

    const where: Prisma.HouseholdWhereInput = {
      masjidId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { familyName: { contains: query.search, mode: 'insensitive' } },
              { headName: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.household.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { familyName: 'asc' },
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.household.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(actor: AuthUser, masjidId: string, id: string): Promise<HouseholdView> {
    assertMasjidMember(actor, masjidId);
    const household = await this.prisma.household.findFirst({
      where: { id, masjidId },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
    if (!household) {
      throw new NotFoundException('Household not found');
    }
    return { ...household, members: household.members.map(toMemberView) };
  }

  async update(
    actor: AuthUser,
    masjidId: string,
    id: string,
    dto: UpdateHouseholdDto,
  ): Promise<HouseholdView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, id);
    const updated = await this.prisma.household.update({
      where: { id },
      data: dto,
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
    return { ...updated, members: updated.members.map(toMemberView) };
  }

  /** Hard delete (cascades members) — restricted to admins at the controller layer. */
  async remove(actor: AuthUser, masjidId: string, id: string): Promise<void> {
    assertMasjidMember(actor, masjidId);
    const { count } = await this.prisma.household.deleteMany({ where: { id, masjidId } });
    if (count === 0) {
      throw new NotFoundException('Household not found');
    }
  }

  async addMember(
    actor: AuthUser,
    masjidId: string,
    householdId: string,
    dto: CreateHouseholdMemberDto,
  ): Promise<HouseholdMemberView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, householdId);
    const member = await this.prisma.householdMember.create({
      data: { householdId, ...memberCreateData(dto) },
    });
    return toMemberView(member);
  }

  async updateMember(
    actor: AuthUser,
    masjidId: string,
    householdId: string,
    memberId: string,
    dto: UpdateHouseholdMemberDto,
  ): Promise<HouseholdMemberView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, householdId);
    const existing = await this.prisma.householdMember.findFirst({
      where: { id: memberId, householdId },
    });
    if (!existing) {
      throw new NotFoundException('Member not found in this household');
    }
    const { dateOfBirth, ...rest } = dto;
    const member = await this.prisma.householdMember.update({
      where: { id: memberId },
      data: {
        ...rest,
        ...(dateOfBirth !== undefined
          ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }
          : {}),
      },
    });
    return toMemberView(member);
  }

  async removeMember(
    actor: AuthUser,
    masjidId: string,
    householdId: string,
    memberId: string,
  ): Promise<void> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, householdId);
    const { count } = await this.prisma.householdMember.deleteMany({
      where: { id: memberId, householdId },
    });
    if (count === 0) {
      throw new NotFoundException('Member not found in this household');
    }
  }

  /** Community census totals for the dashboard. */
  async summary(
    actor: AuthUser,
    masjidId: string,
  ): Promise<{
    total: number;
    active: number;
    inactive: number;
    movedOut: number;
    members: number;
  }> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);
    const [total, active, inactive, movedOut, members] = await this.prisma.$transaction([
      this.prisma.household.count({ where: { masjidId } }),
      this.prisma.household.count({ where: { masjidId, status: 'ACTIVE' } }),
      this.prisma.household.count({ where: { masjidId, status: 'INACTIVE' } }),
      this.prisma.household.count({ where: { masjidId, status: 'MOVED_OUT' } }),
      this.prisma.householdMember.count({ where: { household: { masjidId } } }),
    ]);
    return { total, active, inactive, movedOut, members };
  }

  /**
   * Search individuals across every household in the masjid. Each whitespace token
   * must match one of name/phone/email, so "Rameez Handel" narrows to that person.
   */
  async searchMembers(
    actor: AuthUser,
    masjidId: string,
    query: QueryMembersDto,
  ): Promise<PaginatedResult<MemberSearchView>> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);

    const tokens = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    const where: Prisma.HouseholdMemberWhereInput = {
      household: { masjidId },
      ...(query.gender ? { gender: query.gender } : {}),
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { firstName: { contains: token, mode: 'insensitive' as const } },
                { lastName: { contains: token, mode: 'insensitive' as const } },
                { phone: { contains: token, mode: 'insensitive' as const } },
                { email: { contains: token, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.householdMember.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        include: {
          household: { select: { id: true, familyName: true, headName: true, status: true } },
        },
      }),
      this.prisma.householdMember.count({ where }),
    ]);

    const view = data.map(({ household, ...member }) => ({
      ...toMemberView(member),
      household,
    }));
    return paginated(view, total, query);
  }

  private async getHouseholdOrThrow(masjidId: string, id: string): Promise<Household> {
    const household = await this.prisma.household.findFirst({ where: { id, masjidId } });
    if (!household) {
      throw new NotFoundException('Household not found');
    }
    return household;
  }

  private async assertMasjidExists(masjidId: string): Promise<MasjidStatus> {
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { status: true },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    return masjid.status;
  }

  private async assertMasjidWritable(masjidId: string): Promise<void> {
    const status = await this.assertMasjidExists(masjidId);
    if (status === MasjidStatus.ARCHIVED) {
      throw new ConflictException('Cannot modify content of an archived masjid');
    }
  }
}
