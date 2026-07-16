import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MasjidStatus, UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { HouseholdImportService } from './household-import.service';

const HEADERS = [
  'Family Name',
  'Head Name',
  'Phone',
  'Email',
  'Address',
  'City',
  'Status',
  'Member First Name',
  'Member Last Name',
  'Relationship',
  'Gender',
  'Date of Birth',
];

async function buildXlsx(rows: (string | null)[][], headers = HEADERS): Promise<Buffer> {
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

  it('builds a template that round-trips with the expected headers', async () => {
    const buffer = await service.buildTemplate(actor, 'masjid-a');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const header = wb.getWorksheet('Households')!.getRow(1);
    expect(header.getCell(1).value).toBe('Family Name');
    expect(header.getCell(8).value).toBe('Member First Name');
  });

  it('groups rows into households and previews on dry-run', async () => {
    const buffer = await buildXlsx([
      [
        'Handel Family',
        'Rameez Handel',
        '',
        '',
        '',
        'Toronto',
        'ACTIVE',
        'Rameez',
        'Handel',
        'Head',
        'Male',
        '1985-04-12',
      ],
      [
        'Handel Family',
        'Rameez Handel',
        '',
        '',
        '',
        '',
        '',
        'Aisha',
        'Handel',
        'Spouse',
        'Female',
        '1988-09-30',
      ],
      ['Omar Family', 'Bilal Omar', '', '', '', '', '', 'Bilal', 'Omar', 'Head', 'Male', ''],
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

  it('commits by creating one household per group with its members', async () => {
    const create = jest.fn().mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ household: { create } }),
    );
    const buffer = await buildXlsx([
      ['Handel Family', 'Rameez Handel', '', '', '', '', '', 'Rameez', 'Handel', 'Head', '', ''],
      [
        'Handel Family',
        'Rameez Handel',
        '',
        '',
        '',
        '',
        '',
        'Aisha',
        'Handel',
        'Spouse',
        '',
        '1988-09-30',
      ],
    ]);
    const result = await service.import(actor, 'masjid-a', file(buffer), false);
    expect(result.imported).toBe(true);
    expect(result.households).toBe(1);
    expect(result.members).toBe(2);
    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0][0].data;
    expect(created.members.create).toHaveLength(2);
    expect(created.createdById).toBe('admin-1');
  });

  it('reports row-level errors and writes nothing', async () => {
    const buffer = await buildXlsx([
      ['', 'No Family', '', '', '', '', '', 'X', 'Y', '', '', ''], // missing family name
      ['Ok Family', 'Head', '', '', '', '', 'WRONG', 'A', 'B', '', 'Alien', 'not-a-date'],
      ['Solo', 'Head', '', '', '', '', '', 'OnlyFirst', '', '', '', ''], // missing member last name
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
    const buffer = await buildXlsx([['A', 'B']]);
    await expect(service.import(actor, 'masjid-a', file(buffer, 'data.csv'), true)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.import(actor, 'masjid-a', undefined, true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks import into another masjid', async () => {
    const buffer = await buildXlsx([['A', 'B']]);
    await expect(service.import(actor, 'masjid-b', file(buffer), true)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
