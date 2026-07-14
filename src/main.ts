import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());
  app.flushLogs();

  configureApp(app);

  const configService = app.get(ConfigService<Env, true>);
  if (configService.get('SWAGGER_ENABLED', { infer: true })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MasjidHub API')
      .setDescription('Multi-tenant platform for masjids: one platform, many masjids.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = configService.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
