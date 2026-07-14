import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Announcement, ContentStatus, MasjidStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    actor: AuthUser,
    masjidId: string,
    dto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const status = dto.status ?? ContentStatus.DRAFT;
    return this.prisma.announcement.create({
      data: {
        masjidId,
        title: dto.title,
        body: dto.body,
        status,
        publishedAt: status === ContentStatus.PUBLISHED ? new Date() : null,
        createdById: actor.id,
      },
    });
  }

  async findAll(
    actor: AuthUser,
    masjidId: string,
    query: QueryAnnouncementsDto,
  ): Promise<PaginatedResult<Announcement>> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);

    const where: Prisma.AnnouncementWhereInput = {
      masjidId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { body: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(actor: AuthUser, masjidId: string, id: string): Promise<Announcement> {
    assertMasjidMember(actor, masjidId);
    const announcement = await this.prisma.announcement.findFirst({ where: { id, masjidId } });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  async update(
    actor: AuthUser,
    masjidId: string,
    id: string,
    dto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const existing = await this.prisma.announcement.findFirst({ where: { id, masjidId } });
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }
    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...dto,
        // publishedAt records the first publication; later edits keep it.
        ...(dto.status === ContentStatus.PUBLISHED && !existing.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });
  }

  /** Hard delete — restricted to admins at the controller layer. */
  async delete(actor: AuthUser, masjidId: string, id: string): Promise<void> {
    assertMasjidMember(actor, masjidId);
    const { count } = await this.prisma.announcement.deleteMany({ where: { id, masjidId } });
    if (count === 0) {
      throw new NotFoundException('Announcement not found');
    }
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
