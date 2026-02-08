import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from '@shared/logger.config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(loggerConfig),
    bodyParser: false,
  });

  // Task 7.4: Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // Disable for Swagger UI
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('FiFi Alert API')
    .setDescription(
      'Geolocation-based missing pet notification system - API documentation for alerts, sightings, devices, and push notifications',
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter your bearer token from authentication',
    })
    .addTag('alerts', 'Missing pet alert management')
    .addTag('Authentication', 'User authentication and session management')
    .addTag('Users', 'User profile and account management')
    .addTag('Pets', 'Pet profile management')
    .addTag('Pet Types', 'Pet type management')
    .addTag('Sightings', 'Pet sighting reports')
    .addTag('Devices', 'Device registration and location management')
    .addTag('Admin', 'Administrative operations')
    .addTag('Gates', 'Feature gate management')
    .addTag('Audit Logs', 'System audit log queries')
    .addTag('health', 'System health monitoring')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Serve Swagger UI at /api and the raw OpenAPI spec at /api/openapi.json
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: '/api/openapi.json',
    customSiteTitle: 'FiFi Alert API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  // Configure CORS for production
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['*']; // Default to allow all in development

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      // In production, check against allowed origins
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true, // Allow cookies and Authorization header
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID', // Request correlation
      'X-Idempotency-Key', // Idempotency support
      'X-Session-ID', // Session tracking
    ],
    exposedHeaders: [
      'X-Request-ID', // Allow clients to read request ID
      'X-RateLimit-Remaining', // Rate limit info
      'X-RateLimit-Reset',
    ],
    maxAge: 86400, // Cache preflight requests for 24 hours
  });

  // @ts-ignore
  app.set('query parser', 'extended');
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
