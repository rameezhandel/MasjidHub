import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, RelationshipType, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdImportService, deriveHouseholdRelationships } from './household-import.service';

const HEADERS = [
  'Family Name',
  'Head Name',
  'Phone',
  'Email',
  'Address',
  'City',
  'Status',
  'Fee Amount',
  'Fee Frequency',
  'Fee Start Date',
  'Member First Name',
  'Member Last Name',
  'Relationship',
  'Gender',
  'Date of Birth',
];

interface RowInput {
  familyName?: string;
  headName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  status?: string;
  feeAmount?: string;
  feeFrequency?: string;
  feeStart?: string;
  memberFirstName?: string;
  memberLastName?: string;
  relationship?: string;
  gender?: string;
  dob?: string;
}

/** Build a full-width row so cells line up with HEADERS. */
function row(v: RowInput): string[] {
  return [
    v.familyName ?? '',
    v.headName ?? '',
    v.phone ?? '',
    v.email ?? '',
    v.address ?? '',
    v.city ?? '',
    v.status ?? '',
    v.feeAmount ?? '',
    v.feeFrequency ?? '',
    v.feeStart ?? '',
    v.memberFirstName ?? '',
    v.memberLastName ?? '',
    v.relationship ?? '',
    v.gender ?? '',
    v.dob ?? '',
  ];
}

async function buildXlsx(rows: string[][], headers = HEADERS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const file = (buffer: Buffer, originalname = 'test.xlsx'): Express.Multer.File =>
  ({ buffer, originalname, size: buffer.length }) as Express.Multer.File;

describe('HouseholdImportService', () => {
  let service: HouseholdImportService;

  const prisma = {
    masjid: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const actor: AuthUser = {
    id: 'admin-1',
    email: 'admin@test.local',
    role: UserRole.MASJID_ADMIN,
    masjidId: 'masjid-a',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.masjid.findUnique.mockResolvedValue({ status: MasjidStatus.ACTIVE });
    const moduleRef = await Test.createTestingModule({
      providers: [HouseholdImportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(HouseholdImportService);
  });

  /** Wire prisma.$transaction to a tx double and return the spies. */
  function stubTransaction() {
    const household = { create: jest.fn().mockResolvedValue({ id: 'hh-1' }) };
    let n = 0;
    const householdMember = { create: jest.fn().mockImplementation(() => ({ id: `m-${n++}` })) };
    const memberRelationship = { create: jest.fn().mockResolvedValue({}) };
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ household, householdMember, memberRelationship }),
    );
    return { household, householdMember, memberRelationship };
  }

  it('builds a template with the fee and member headers', async () => {
    const buffer = await service.buildTemplate(actor, 'masjid-a');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const header = wb.getWorksheet('Households')!.getRow(1);
    expect(header.getCell(1).value).toBe('Family Name');
    expect(header.getCell(8).value).toBe('Fee Amount');
    expect(header.getCell(11).value).toBe('Member First Name');
  });

  it('groups rows into households and previews on dry-run', async () => {
    const buffer = await buildXlsx([
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        city: 'Toronto',
        status: 'ACTIVE',
        memberFirstName: 'Rameez',
        memberLastName: 'Handel',
        relationship: 'Head',
        gender: 'Male',
        dob: '1985-04-12',
      }),
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        memberFirstName: 'Aisha',
        memberLastName: 'Handel',
        relationship: 'Spouse',
        gender: 'Female',
        dob: '1988-09-30',
      }),
      row({
        familyName: 'Omar Family',
        headName: 'Bilal Omar',
        memberFirstName: 'Bilal',
        memberLastName: 'Omar',
        relationship: 'Head',
        gender: 'Male',
      }),
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), true);
    expect(result).toEqual({
      dryRun: true,
      imported: false,
      households: 2,
      members: 3,
      errors: [],
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores the household fee from the first row', async () => {
    const { household } = stubTransaction();
    const buffer = await buildXlsx([
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        status: 'ACTIVE',
        feeAmount: '350',
        feeFrequency: 'Monthly',
        feeStart: '2026-01-01',
        memberFirstName: 'Rameez',
        memberLastName: 'Handel',
        relationship: 'Head',
      }),
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), false);
    expect(result.imported).toBe(true);
    const data = household.create.mock.calls[0][0].data;
    expect(data.feeAmountCents).toBe(35000);
    expect(data.feeFrequency).toBe('MONTHLY');
    expect(data.feeStartOn).toBeInstanceOf(Date);
    expect((data.feeStartOn as Date).toISOString().slice(0, 10)).toBe('2026-01-01');
  });

  it('errors when fee amount is given without a frequency', async () => {
    const buffer = await buildXlsx([
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        feeAmount: '350',
        memberFirstName: 'Rameez',
        memberLastName: 'Handel',
        relationship: 'Head',
      }),
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), false);
    expect(result.imported).toBe(false);
    expect(result.errors[0].message).toMatch(/Fee Amount and Fee Frequency/);
  });

  it('creates members and derives a spouse relationship on commit', async () => {
    const { household, householdMember, memberRelationship } = stubTransaction();
    const buffer = await buildXlsx([
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        memberFirstName: 'Rameez',
        memberLastName: 'Handel',
        relationship: 'Head',
      }),
      row({
        familyName: 'Handel Family',
        headName: 'Rameez Handel',
        memberFirstName: 'Aisha',
        memberLastName: 'Handel',
        relationship: 'Spouse',
      }),
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), false);
    expect(result).toMatchObject({ imported: true, households: 1, members: 2 });
    expect(household.create).toHaveBeenCalledTimes(1);
    expect(householdMember.create).toHaveBeenCalledTimes(2);
    // Head (m-0) + Spouse (m-1) => one SPOUSE edge, canonically ordered.
    expect(memberRelationship.create).toHaveBeenCalledTimes(1);
    const edge = memberRelationship.create.mock.calls[0][0].data;
    expect(edge.type).toBe(RelationshipType.SPOUSE);
    expect([edge.fromMemberId, edge.toMemberId].sort()).toEqual(['m-0', 'm-1']);
  });

  it('reports row-level errors and writes nothing', async () => {
    const buffer = await buildXlsx([
      row({ headName: 'No Family', memberFirstName: 'X', memberLastName: 'Y' }), // missing family name
      row({
        familyName: 'Ok Family',
        headName: 'Head',
        status: 'WRONG',
        memberFirstName: 'A',
        memberLastName: 'B',
        gender: 'Alien',
        dob: 'not-a-date',
      }),
      row({ familyName: 'Solo', headName: 'Head', memberFirstName: 'OnlyFirst' }), // missing last name
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), false);
    expect(result.imported).toBe(false);
    expect(result.households).toBe(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].row).toBe(2);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a missing required column', async () => {
    const buffer = await buildXlsx([['x']], ['Head Name']); // no Family Name header
    await expect(service.import(actor, 'masjid-a', file(buffer), true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects non-xlsx files and missing uploads', async () => {
    const buffer = await buildXlsx([row({ familyName: 'A', headName: 'B' })]);
    await expect(service.import(actor, 'masjid-a', file(buffer, 'data.csv'), true)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.import(actor, 'masjid-a', undefined, true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks import into another masjid', async () => {
    const buffer = await buildXlsx([row({ familyName: 'A', headName: 'B' })]);
    await expect(service.import(actor, 'masjid-b', file(buffer), true)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('deriveHouseholdRelationships', () => {
  const member = (firstName: string, relationship: string) => ({
    firstName,
    lastName: 'Khan',
    relationship,
    gender: null,
    dateOfBirth: null,
  });

  it('links spouse, children, and grandparents around the head', () => {
    // 0 head, 1 spouse, 2 son, 3 daughter, 4 father, 5 mother
    const members = [
      member('Imran', 'Head'),
      member('Sana', 'Spouse'),
      member('Zaid', 'Son'),
      member('Hana', 'Daughter'),
      member('Idris', 'Father'),
      member('Ruqayya', 'Mother'),
    ];
    const edges = deriveHouseholdRelationships(members, 'Imran Khan');
    const has = (from: number, to: number, type: RelationshipType) =>
      edges.some((e) => e.fromIndex === from && e.toIndex === to && e.type === type);

    expect(has(0, 1, RelationshipType.SPOUSE)).toBe(true); // head–spouse
    expect(has(0, 2, RelationshipType.PARENT)).toBe(true); // head→son
    expect(has(1, 2, RelationshipType.PARENT)).toBe(true); // spouse→son
    expect(has(0, 3, RelationshipType.PARENT)).toBe(true); // head→daughter
    expect(has(4, 0, RelationshipType.PARENT)).toBe(true); // father→head
    expect(has(5, 0, RelationshipType.PARENT)).toBe(true); // mother→head
    expect(has(4, 5, RelationshipType.SPOUSE)).toBe(true); // father–mother
  });

  it('falls back to the head-name match when no Head label is present', () => {
    const members = [member('Sana', 'Spouse'), member('Imran', '')];
    const edges = deriveHouseholdRelationships(members, 'Imran Khan');
    // Imran (index 1) is the head; spouse edge should connect index 1 and 0.
    expect(edges).toEqual([{ fromIndex: 1, toIndex: 0, type: RelationshipType.SPOUSE }]);
  });
});
