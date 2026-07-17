import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Gender, HouseholdStatus, MasjidStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';

/** Max data rows (members) accepted per upload — keeps the import transaction bounded. */
const MAX_ROWS = 2000;

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  dryRun: boolean;
  imported: boolean;
  households: number;
  members: number;
  errors: ImportError[];
}

/** Canonical field each accepted header maps to (headers are matched case/spacing-insensitively). */
const HEADER_ALIASES: Record<string, string> = {
  familyname: 'familyName',
  family: 'familyName',
  headname: 'headName',
  headofhousehold: 'headName',
  head: 'headName',
  phone: 'phone',
  householdphone: 'phone',
  email: 'email',
  householdemail: 'email',
  address: 'addressLine1',
  addressline1: 'addressLine1',
  address1: 'addressLine1',
  city: 'city',
  status: 'status',
  memberfirstname: 'memberFirstName',
  firstname: 'memberFirstName',
  memberlastname: 'memberLastName',
  lastname: 'memberLastName',
  surname: 'memberLastName',
  relationship: 'relationship',
  relation: 'relationship',
  gender: 'gender',
  sex: 'gender',
  dateofbirth: 'dateOfBirth',
  dob: 'dateOfBirth',
  birthdate: 'dateOfBirth',
};

const TEMPLATE_HEADERS = [
  ['familyName', 'Family Name'],
  ['headName', 'Head Name'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['addressLine1', 'Address'],
  ['city', 'City'],
  ['status', 'Status'],
  ['memberFirstName', 'Member First Name'],
  ['memberLastName', 'Member Last Name'],
  ['relationship', 'Relationship'],
  ['gender', 'Gender'],
  ['dateOfBirth', 'Date of Birth'],
] as const;

interface ParsedMember {
  firstName: string;
  lastName: string;
  relationship: string | null;
  gender: Gender | null;
  dateOfBirth: Date | null;
}

interface HouseholdGroup {
  familyName: string;
  headName: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  status: HouseholdStatus;
  members: ParsedMember[];
}

@Injectable()
export class HouseholdImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Generates the .xlsx template with headers, a worked example, and an instructions sheet. */
  async buildTemplate(actor: AuthUser, masjidId: string): Promise<Buffer> {
    assertMasjidMember(actor, masjidId);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Households');
    sheet.columns = TEMPLATE_HEADERS.map(([, header]) => ({ header, width: 20 }));
    sheet.getRow(1).font = { bold: true };
    // One household with two members = two rows sharing the same family + head.
    sheet.addRow([
      'Handel Family',
      'Rameez Handel',
      '+1-416-555-0100',
      'rameez@example.com',
      '12 Example Street',
      'Toronto',
      'ACTIVE',
      'Rameez',
      'Handel',
      'Head',
      'Male',
      '1985-04-12',
    ]);
    sheet.addRow([
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
    ]);

    const notes = workbook.addWorksheet('Instructions');
    notes.getColumn(1).width = 100;
    [
      'How to fill in this sheet',
      '',
      '• One row per PERSON. Rows with the same Family Name + Head Name become one household.',
      '• Family Name and Head Name are required on every row.',
      '• A row with no member name records the household only (no person).',
      '• Status: ACTIVE, INACTIVE or MOVED_OUT (defaults to ACTIVE).',
      '• Gender: Male or Female (optional).',
      '• Date of Birth: YYYY-MM-DD or an Excel date (optional).',
      '• Column order does not matter; only the header names are read.',
      `• Up to ${MAX_ROWS} rows per file.`,
    ].forEach((line, index) => {
      const cell = notes.getCell(`A${index + 1}`);
      cell.value = line;
      if (index === 0) cell.font = { bold: true, size: 14 };
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async import(
    actor: AuthUser,
    masjidId: string,
    file: Express.Multer.File | undefined,
    dryRun: boolean,
  ): Promise<ImportResult> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);

    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (!file.originalname?.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Please upload an Excel .xlsx file');
    }

    const { groups, errors } = await this.parse(file.buffer);
    const members = groups.reduce((sum, g) => sum + g.members.length, 0);

    if (errors.length > 0) {
      return { dryRun, imported: false, households: 0, members: 0, errors };
    }
    if (dryRun) {
      return { dryRun: true, imported: false, households: groups.length, members, errors: [] };
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const group of groups) {
          await tx.household.create({
            data: {
              masjidId,
              createdById: actor.id,
              familyName: group.familyName,
              headName: group.headName,
              phone: group.phone,
              email: group.email,
              addressLine1: group.addressLine1,
              city: group.city,
              status: group.status,
              members: {
                create: group.members.map((m) => ({
                  firstName: m.firstName,
                  lastName: m.lastName,
                  relationship: m.relationship,
                  gender: m.gender,
                  dateOfBirth: m.dateOfBirth,
                })),
              },
            },
          });
        }
      },
      { timeout: 120_000 },
    );

    return { dryRun: false, imported: true, households: groups.length, members, errors: [] };
  }

  private async parse(
    buffer: Buffer,
  ): Promise<{ groups: HouseholdGroup[]; errors: ImportError[] }> {
    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs's Buffer type differs from Node 22's generic Buffer.
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BadRequestException('Could not read the Excel file — is it a valid .xlsx?');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('The workbook has no sheets');
    }

    const columns = this.mapHeaders(sheet.getRow(1));
    if (columns.familyName === undefined || columns.headName === undefined) {
      throw new BadRequestException(
        'Missing required columns. The first row must include "Family Name" and "Head Name" headers.',
      );
    }

    const groups = new Map<string, HouseholdGroup>();
    const errors: ImportError[] = [];
    let dataRows = 0;

    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const cell = (field: string): ExcelJS.CellValue =>
        columns[field] !== undefined ? row.getCell(columns[field]).value : null;

      const familyName = cellText(cell('familyName'));
      const headName = cellText(cell('headName'));
      const memberFirst = cellText(cell('memberFirstName'));
      const memberLast = cellText(cell('memberLastName'));

      // Skip fully-empty rows silently.
      if (!familyName && !headName && !memberFirst && !memberLast) {
        continue;
      }
      dataRows += 1;
      if (dataRows > MAX_ROWS) {
        throw new BadRequestException(`Too many rows — the limit is ${MAX_ROWS} per file`);
      }

      const rowErrors: string[] = [];
      if (!familyName) rowErrors.push('Family Name is required');
      if (!headName) rowErrors.push('Head Name is required');

      const status = parseStatus(cellText(cell('status')), rowErrors);
      const gender = parseGender(cellText(cell('gender')), rowErrors);
      const dateOfBirth = parseDob(cell('dateOfBirth'), rowErrors);

      let member: ParsedMember | null = null;
      if (memberFirst || memberLast) {
        if (!memberFirst) rowErrors.push('Member Last Name is set but First Name is empty');
        if (!memberLast) rowErrors.push('Member First Name is set but Last Name is empty');
        if (memberFirst && memberLast) {
          member = {
            firstName: memberFirst,
            lastName: memberLast,
            relationship: cellText(cell('relationship')) || null,
            gender,
            dateOfBirth,
          };
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: r, message: rowErrors.join('; ') });
        continue;
      }

      const key = `${familyName.toLowerCase()} ${headName.toLowerCase()}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          familyName,
          headName,
          phone: cellText(cell('phone')) || null,
          email: cellText(cell('email')) || null,
          addressLine1: cellText(cell('addressLine1')) || null,
          city: cellText(cell('city')) || null,
          status,
          members: [],
        };
        groups.set(key, group);
      }
      if (member) {
        group.members.push(member);
      }
    }

    if (groups.size === 0 && errors.length === 0) {
      throw new BadRequestException('The sheet has no data rows');
    }
    return { groups: [...groups.values()], errors };
  }

  private mapHeaders(headerRow: ExcelJS.Row): Record<string, number> {
    const columns: Record<string, number> = {};
    headerRow.eachCell((cellValue, colNumber) => {
      const normalized = cellText(cellValue.value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      const field = HEADER_ALIASES[normalized];
      if (field && columns[field] === undefined) {
        columns[field] = colNumber;
      }
    });
    return columns;
  }

  private async assertMasjidWritable(masjidId: string): Promise<void> {
    const masjid = await this.prisma.masjid.findUnique({
      where: { id: masjidId },
      select: { status: true },
    });
    if (!masjid) {
      throw new NotFoundException('Masjid not found');
    }
    if (masjid.status === MasjidStatus.ARCHIVED) {
      throw new ConflictException('Cannot modify content of an archived masjid');
    }
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('text' in value && value.text != null) return String(value.text).trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  }
  return '';
}

function parseStatus(text: string, errors: string[]): HouseholdStatus {
  if (!text) return HouseholdStatus.ACTIVE;
  const normalized = text.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'active') return HouseholdStatus.ACTIVE;
  if (normalized === 'inactive') return HouseholdStatus.INACTIVE;
  if (normalized === 'movedout') return HouseholdStatus.MOVED_OUT;
  errors.push(`Invalid Status "${text}" (use ACTIVE, INACTIVE or MOVED_OUT)`);
  return HouseholdStatus.ACTIVE;
}

function parseGender(text: string, errors: string[]): Gender | null {
  if (!text) return null;
  const normalized = text.toLowerCase();
  if (normalized === 'male' || normalized === 'm') return Gender.MALE;
  if (normalized === 'female' || normalized === 'f') return Gender.FEMALE;
  errors.push(`Invalid Gender "${text}" (use Male or Female)`);
  return null;
}

function parseDob(value: ExcelJS.CellValue, errors: string[]): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  const text = cellText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  errors.push(`Invalid Date of Birth "${text}" (use YYYY-MM-DD)`);
  return null;
}
