import { Injectable, Logger } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PaginatedResult, paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from './audit-actions';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  masjidId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws — a failed audit write must not break the audited operation. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (error) {
      this.logger.error(
        `Failed to record audit entry ${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll(query: QueryAuditLogsDto): Promise<PaginatedResult<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.masjidId ? { masjidId: query.masjidId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: query.skip,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginated(data, total, query);
  }
}
