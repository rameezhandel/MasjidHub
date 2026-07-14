import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Env } from './config/env';

/**
 * Applies HTTP-level configuration shared by the real bootstrap (main.ts)
 * and the e2e test harness, so tests exercise the production pipeline.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService<Env, true>);

  (app as NestExpressApplication).set('trust proxy', 1);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const corsOrigins = configService
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
}
