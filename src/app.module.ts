import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { EventsModule } from './events/events.module';
import { PrayerTimesModule } from './prayer-times/prayer-times.module';
import { PublicModule } from './public/public.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { Env, validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { MasjidsModule } from './masjids/masjids.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const nodeEnv = configService.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            level: nodeEnv === 'production' ? 'info' : nodeEnv === 'test' ? 'silent' : 'debug',
            transport:
              nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie'],
              remove: true,
            },
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const header = req.headers['x-request-id'];
              const id = typeof header === 'string' && header.length > 0 ? header : randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url?.includes('/health') ?? false,
            },
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: configService.get('THROTTLE_TTL_SECONDS', { infer: true }) * 1000,
            limit: configService.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        skipIf: () => configService.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    PrismaModule,
    MailModule,
    AuthModule,
    MasjidsModule,
    UsersModule,
    PrayerTimesModule,
    AnnouncementsModule,
    EventsModule,
    PublicModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttling first, then authentication, then role checks.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
