import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const configuredOrigins = config.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin: configuredOrigins === '*' ? true : configuredOrigins.split(',').map((origin) => origin.trim()),
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`Teacher Hub GraphQL API: http://localhost:${port}/graphql`);
}

void bootstrap();
