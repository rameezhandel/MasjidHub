import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FeeFrequency,
  Household,
  HouseholdMember,
  HouseholdPayment,
  HouseholdStatus,
  MasjidStatus,
  Prisma,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHouseholdMemberDto, UpdateHouseholdMemberDto } from './dto/household-member.dto';
import { CreateHouseholdDto, QueryHouseholdsDto, UpdateHouseholdDto } from './dto/household.dto';
import { QueryMembersDto } from './dto/member-search.dto';
import { ApplyFeeDto, QueryDuesDto } from './dto/dues.dto';
import { CreatePaymentDto } from './dto/payment.dto';

const toDateStr = (d: Date | null): string | null => d?.toISOString().slice(0, 10) ?? null;

/** API shape: dateOfBirth is a plain YYYY-MM-DD string, not a timestamp. */
export type HouseholdMemberView = Omit<HouseholdMember, 'dateOfBirth'> & {
  dateOfBirth: string | null;
};

/** A member paired with just enough of its household to link back to it. */
export type MemberSearchView = HouseholdMemberView & {
  household: { id: string; familyName: string; headName: string; status: HouseholdStatus };
};

/** feeStartOn is serialized as YYYY-MM-DD, not a timestamp. */
export type HouseholdView = Omit<Household, 'feeStartOn' | 'feeEndOn'> & {
  feeStartOn: string | null;
  feeEndOn: string | null;
  members?: HouseholdMemberView[];
  _count?: { members: number };
};

export type PaymentView = Omit<HouseholdPayment, 'paidOn'> & { paidOn: string };

export interface DuesView {
  /** ISO 4217 currency code of the masjid, for formatting amounts. */
  currency: string;
  feeAmountCents: number | null;
  feeFrequency: FeeFrequency | null;
  feeStartOn: string | null;
  /** When set, accrual stops here (a household that moved out). */
  feeEndOn: string | null;
  /** Fee × periods elapsed since feeStartOn (0 when no fee is set). */
  expectedCents: number;
  paidCents: number;
  /** expectedCents − paidCents; positive means the household owes. */
  balanceCents: number;
  payments: PaymentView[];
}

/** One line of the masjid-wide collection sheet. */
export interface HouseholdDuesRow {
  id: string;
  familyName: string;
  headName: string;
  phone: string | null;
  status: HouseholdStatus;
  feeAmountCents: number | null;
  feeFrequency: FeeFrequency | null;
  feeStartOn: string | null;
  feeEndOn: string | null;
  expectedCents: number;
  paidCents: number;
  balanceCents: number;
}

/** Masjid-wide roll-up, computed over every household (not just the page). */
export interface DuesTotals {
  currency: string;
  expectedCents: number;
  paidCents: number;
  balanceCents: number;
  households: number;
  owingHouseholds: number;
  withoutFee: number;
}

export function toMemberView(member: HouseholdMember): HouseholdMemberView {
  return { ...member, dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? null };
}

export function toHouseholdView(
  household: Household & { members?: HouseholdMember[]; _count?: { members: number } },
): HouseholdView {
  const { members, _count, ...rest } = household;
  return {
    ...rest,
    feeStartOn: toDateStr(household.feeStartOn),
    feeEndOn: toDateStr(household.feeEndOn),
    ...(members ? { members: members.map(toMemberView) } : {}),
    ...(_count ? { _count } : {}),
  };
}

function toPaymentView(payment: HouseholdPayment): PaymentView {
  return { ...payment, paidOn: toDateStr(payment.paidOn)! };
}

/**
 * What a household owes to date: fee × periods, stopping at `feeEndOn` when
 * one is set. Without that cutoff a family that moved out would keep accruing
 * for ever, since accrual is otherwise open-ended.
 */
export function expectedToDate(
  household: Pick<Household, 'feeAmountCents' | 'feeFrequency' | 'feeStartOn' | 'feeEndOn'>,
  today: Date,
): number {
  const { feeAmountCents, feeFrequency, feeStartOn, feeEndOn } = household;
  if (!feeAmountCents || !feeFrequency || !feeStartOn) return 0;
  const until = feeEndOn && feeEndOn < today ? feeEndOn : today;
  return feeAmountCents * periodsElapsed(feeStartOn, until, feeFrequency);
}

/**
 * Whole fee periods elapsed from `start` up to and including the current one.
 * Monthly counts calendar months; yearly counts calendar years. 0 if start is
 * in the future.
 */
export function periodsElapsed(start: Date, today: Date, frequency: FeeFrequency): number {
  if (today < start) return 0;
  if (frequency === FeeFrequency.YEARLY) {
    return today.getUTCFullYear() - start.getUTCFullYear() + 1;
  }
  return (
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth()) +
    1
  );
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
    const { members, feeStartOn, ...household } = dto;
    const created = await this.prisma.household.create({
      data: {
        ...household,
        ...(feeStartOn ? { feeStartOn: new Date(feeStartOn) } : {}),
        masjidId,
        createdById: actor.id,
        ...(members?.length ? { members: { create: members.map(memberCreateData) } } : {}),
      },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
    return toHouseholdView(created);
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
    return paginated(data.map(toHouseholdView), total, query);
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
    return toHouseholdView(household);
  }

  async update(
    actor: AuthUser,
    masjidId: string,
    id: string,
    dto: UpdateHouseholdDto,
  ): Promise<HouseholdView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const existing = await this.getHouseholdOrThrow(masjidId, id);
    const { feeStartOn, feeEndOn, ...rest } = dto;

    // A household that stops being active stops owing: close the fee period on
    // the day it changes, unless the caller set an end date themselves. Coming
    // back to ACTIVE reopens it.
    let statusEnd: { feeEndOn: Date | null } | Record<string, never> = {};
    if (feeEndOn === undefined && rest.status && rest.status !== existing.status) {
      if (rest.status !== HouseholdStatus.ACTIVE && !existing.feeEndOn) {
        statusEnd = { feeEndOn: new Date() };
      } else if (rest.status === HouseholdStatus.ACTIVE && existing.feeEndOn) {
        statusEnd = { feeEndOn: null };
      }
    }

    const updated = await this.prisma.household.update({
      where: { id },
      data: {
        ...rest,
        ...(feeStartOn !== undefined
          ? { feeStartOn: feeStartOn ? new Date(feeStartOn) : null }
          : {}),
        ...(feeEndOn !== undefined ? { feeEndOn: feeEndOn ? new Date(feeEndOn) : null } : {}),
        ...statusEnd,
      },
      include: { members: { orderBy: { createdAt: 'asc' } } },
    });
    return toHouseholdView(updated);
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

  /** Fee status for a household: expected (fee × periods), paid, balance, history. */
  async dues(actor: AuthUser, masjidId: string, householdId: string): Promise<DuesView> {
    assertMasjidMember(actor, masjidId);
    const household = await this.getHouseholdOrThrow(masjidId, householdId);
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { currency: true },
    });
    const payments = await this.prisma.householdPayment.findMany({
      where: { householdId },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
    });
    const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

    const expectedCents = expectedToDate(household, new Date());

    return {
      currency: masjid?.currency ?? 'INR',
      feeAmountCents: household.feeAmountCents,
      feeFrequency: household.feeFrequency,
      feeStartOn: toDateStr(household.feeStartOn),
      feeEndOn: toDateStr(household.feeEndOn),
      expectedCents,
      paidCents,
      balanceCents: expectedCents - paidCents,
      payments: payments.map(toPaymentView),
    };
  }

  /**
   * Collection sheet for the whole masjid: every household's fee and balance
   * in one pass, plus the totals a treasurer actually wants.
   *
   * Balance is derived rather than stored, so it cannot be filtered or sorted
   * in SQL. We total payments in one grouped query, compute in memory, then
   * page — fine at the scale of a masjid's household list.
   */
  async duesList(
    actor: AuthUser,
    masjidId: string,
    query: QueryDuesDto,
  ): Promise<PaginatedResult<HouseholdDuesRow> & { totals: DuesTotals }> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);

    const rows = await this.duesRows(masjidId, query.search);
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { currency: true },
    });

    // Totals describe the whole masjid, not the filtered page.
    const totals: DuesTotals = {
      currency: masjid?.currency ?? 'INR',
      expectedCents: rows.reduce((sum, r) => sum + r.expectedCents, 0),
      paidCents: rows.reduce((sum, r) => sum + r.paidCents, 0),
      balanceCents: rows.reduce((sum, r) => sum + r.balanceCents, 0),
      households: rows.length,
      owingHouseholds: rows.filter((r) => r.balanceCents > 0).length,
      withoutFee: rows.filter((r) => r.feeAmountCents == null || r.feeFrequency == null).length,
    };

    const filtered = rows.filter((row) => {
      switch (query.filter) {
        case 'owing':
          return row.balanceCents > 0;
        case 'settled':
          return row.balanceCents <= 0;
        case 'no-fee':
          return row.feeAmountCents == null || row.feeFrequency == null;
        default:
          return true;
      }
    });
    const page = filtered.slice(query.skip, query.skip + query.pageSize);
    return { ...paginated(page, filtered.length, query), totals };
  }

  /** Uniform fee across the masjid — the common case, and painful one by one. */
  async applyFee(
    actor: AuthUser,
    masjidId: string,
    dto: ApplyFeeDto,
  ): Promise<{ updated: number; skipped: number }> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);

    // Households that have left are excluded: their fee period is closed.
    const where: Prisma.HouseholdWhereInput = {
      masjidId,
      status: HouseholdStatus.ACTIVE,
      ...(dto.onlyWithoutFee ? { OR: [{ feeAmountCents: null }, { feeFrequency: null }] } : {}),
    };
    const total = await this.prisma.household.count({
      where: { masjidId, status: HouseholdStatus.ACTIVE },
    });
    const { count } = await this.prisma.household.updateMany({
      where,
      data: {
        feeAmountCents: dto.feeAmountCents,
        feeFrequency: dto.feeFrequency,
        feeStartOn: new Date(dto.feeStartOn),
      },
    });
    return { updated: count, skipped: total - count };
  }

  /** The same collection sheet as a spreadsheet, for collectors working offline. */
  async duesExport(actor: AuthUser, masjidId: string): Promise<Buffer> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { name: true, currency: true },
    });
    const rows = await this.duesRows(masjidId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dues');
    const money = (cents: number) => cents / 100;

    sheet.columns = [
      { header: 'Family', key: 'familyName', width: 24 },
      { header: 'Head of household', key: 'headName', width: 24 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: `Fee (${masjid?.currency ?? 'INR'})`, key: 'fee', width: 12 },
      { header: 'Frequency', key: 'frequency', width: 12 },
      { header: 'Fee from', key: 'feeStartOn', width: 12 },
      { header: 'Fee until', key: 'feeEndOn', width: 12 },
      { header: 'Owed to date', key: 'expected', width: 14 },
      { header: 'Paid', key: 'paid', width: 12 },
      { header: 'Balance', key: 'balance', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of rows) {
      sheet.addRow({
        familyName: row.familyName,
        headName: row.headName,
        phone: row.phone ?? '',
        status: row.status,
        fee: row.feeAmountCents != null ? money(row.feeAmountCents) : '',
        frequency: row.feeFrequency ?? '',
        feeStartOn: row.feeStartOn ?? '',
        feeEndOn: row.feeEndOn ?? '',
        expected: money(row.expectedCents),
        paid: money(row.paidCents),
        balance: money(row.balanceCents),
      });
    }

    const totalRow = sheet.addRow({
      familyName: 'Total',
      expected: money(rows.reduce((s, r) => s + r.expectedCents, 0)),
      paid: money(rows.reduce((s, r) => s + r.paidCents, 0)),
      balance: money(rows.reduce((s, r) => s + r.balanceCents, 0)),
    });
    totalRow.font = { bold: true };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Households joined to their payment totals, with balances computed. */
  private async duesRows(masjidId: string, search?: string): Promise<HouseholdDuesRow[]> {
    const where: Prisma.HouseholdWhereInput = {
      masjidId,
      ...(search
        ? {
            OR: [
              { familyName: { contains: search, mode: 'insensitive' } },
              { headName: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const households = await this.prisma.household.findMany({
      where,
      orderBy: { familyName: 'asc' },
    });
    const sums = await this.prisma.householdPayment.groupBy({
      by: ['householdId'],
      where: { household: { masjidId } },
      _sum: { amountCents: true },
    });
    const paidByHousehold = new Map(sums.map((s) => [s.householdId, s._sum.amountCents ?? 0]));

    const today = new Date();
    return households.map((household) => {
      const expectedCents = expectedToDate(household, today);
      const paidCents = paidByHousehold.get(household.id) ?? 0;
      return {
        id: household.id,
        familyName: household.familyName,
        headName: household.headName,
        phone: household.phone,
        status: household.status,
        feeAmountCents: household.feeAmountCents,
        feeFrequency: household.feeFrequency,
        feeStartOn: toDateStr(household.feeStartOn),
        feeEndOn: toDateStr(household.feeEndOn),
        expectedCents,
        paidCents,
        balanceCents: expectedCents - paidCents,
      };
    });
  }

  async addPayment(
    actor: AuthUser,
    masjidId: string,
    householdId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentView> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, householdId);
    const payment = await this.prisma.householdPayment.create({
      data: {
        householdId,
        amountCents: dto.amountCents,
        paidOn: new Date(dto.paidOn),
        method: dto.method,
        periodLabel: dto.periodLabel,
        note: dto.note,
        recordedById: actor.id,
      },
    });
    return toPaymentView(payment);
  }

  async removePayment(
    actor: AuthUser,
    masjidId: string,
    householdId: string,
    paymentId: string,
  ): Promise<void> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    await this.getHouseholdOrThrow(masjidId, householdId);
    const { count } = await this.prisma.householdPayment.deleteMany({
      where: { id: paymentId, householdId },
    });
    if (count === 0) {
      throw new NotFoundException('Payment not found');
    }
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
