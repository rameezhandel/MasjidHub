import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Event, EventStatus, MasjidStatus, Prisma } from '@prisma/client';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { assertMasjidMember } from '../common/utils/tenant-access';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto, QueryEventsDto, UpdateEventDto } from './dto/event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthUser, masjidId: string, dto: CreateEventDto): Promise<Event> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    EventsService.assertTimeOrder(startsAt, endsAt);

    return this.prisma.event.create({
      data: {
        masjidId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt,
        endsAt,
        status: dto.status ?? EventStatus.DRAFT,
        createdById: actor.id,
      },
    });
  }

  async findAll(
    actor: AuthUser,
    masjidId: string,
    query: QueryEventsDto,
  ): Promise<PaginatedResult<Event>> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidExists(masjidId);

    const where: Prisma.EventWhereInput = {
      masjidId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.upcoming || query.from || query.to
        ? {
            startsAt: {
              ...(query.upcoming ? { gte: new Date() } : {}),
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async findOne(actor: AuthUser, masjidId: string, id: string): Promise<Event> {
    assertMasjidMember(actor, masjidId);
    const event = await this.prisma.event.findFirst({ where: { id, masjidId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async update(actor: AuthUser, masjidId: string, id: string, dto: UpdateEventDto): Promise<Event> {
    assertMasjidMember(actor, masjidId);
    await this.assertMasjidWritable(masjidId);
    const existing = await this.prisma.event.findFirst({ where: { id, masjidId } });
    if (!existing) {
      throw new NotFoundException('Event not found');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt =
      dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : existing.endsAt;
    EventsService.assertTimeOrder(startsAt, endsAt);

    return this.prisma.event.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt !== undefined ? endsAt : undefined,
        status: dto.status,
      },
    });
  }

  /** Hard delete — restricted to admins at the controller layer. */
  async delete(actor: AuthUser, masjidId: string, id: string): Promise<void> {
    assertMasjidMember(actor, masjidId);
    const { count } = await this.prisma.event.deleteMany({ where: { id, masjidId } });
    if (count === 0) {
      throw new NotFoundException('Event not found');
    }
  }

  private static assertTimeOrder(startsAt: Date, endsAt: Date | null): void {
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
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
