import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness: verifies database connectivity' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prismaIndicator.pingCheck('database', this.prisma)]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness: process is up' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }
}
