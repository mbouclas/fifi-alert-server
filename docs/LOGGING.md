# FiFi Alert - Logging System Documentation

## Overview

FiFi Alert uses Winston for structured logging with daily log rotation, request ID correlation, and PII sanitization. All logs are written in JSON format for easy parsing and analysis.

## Log Files

Logs are stored in the `./logs` directory with automatic rotation:

- **application-%DATE%.log**: All application logs (info, warn, error, debug)
  - Rotation: Daily
  - Retention: 14 days
  - Max size: 20MB per file
  - Compressed: Yes (gzip)

- **error-%DATE%.log**: Error logs only
  - Rotation: Daily
  - Retention: 30 days (kept longer for debugging)
  - Max size: 20MB per file
  - Compressed: Yes (gzip)

- **events-%DATE%.log**: Business events for analytics
  - Rotation: Daily
  - Retention: 30 days
  - Max size: 50MB per file
  - Compressed: Yes (gzip)

## Log Levels

Log levels are automatically set based on `NODE_ENV`:

| Environment | Default Level | Override with |
|-------------|---------------|---------------|
| production  | info          | LOG_LEVEL=info |
| staging     | info          | LOG_LEVEL=debug |
| development | debug         | LOG_LEVEL=debug |
| test        | error         | LOG_LEVEL=error |

**Log Level Hierarchy:** error > warn > info > debug

## Request ID Correlation

Every HTTP request is assigned a unique request ID (UUID v4) for log correlation:

```typescript
// Client can send X-Request-ID header
curl -H "X-Request-ID: my-custom-id" http://localhost:3000/alerts

// Otherwise, server generates one automatically
// Response includes X-Request-ID header
```

All logs for a request include the `request_id` field:

```json
{
  "timestamp": "2026-02-05 10:30:00.123",
  "level": "info",
  "event": "http_request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "url": "/alerts",
  "user_id": "user123"
}
```

## Structured Log Format

All logs are JSON objects with consistent structure:

```json
{
  "timestamp": "2026-02-05 10:30:00.123",
  "level": "info",
  "event": "alert_created",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Alert created successfully",
  "alert_id": "alert123",
  "user_id": "user456",
  "species": "DOG",
  "radius_km": 10,
  "metadata": {
    "context": "AlertService",
    "additional_data": "..."
  }
}
```

### Standard Fields

- **timestamp**: ISO 8601 format with milliseconds
- **level**: error | warn | info | debug
- **event**: Event type (e.g., `alert_created`, `notification_sent`)
- **request_id**: Correlation ID for tracing requests
- **message**: Human-readable description
- **user_id**: User who triggered the action (if authenticated)
- **metadata**: Additional context (service name, stack traces, etc.)

## Key Events Logged

### Alert Events
- **alert_created**: Alert created with species, radius, estimated reach
- **alert_updated**: Alert modified by owner
- **alert_resolved**: Alert marked as resolved with outcome
- **alert_renewed**: Alert expiration extended
- **alert_expired**: Alert automatically expired by cron job

### Notification Events
- **notification_queued**: Notification job added to BullMQ
- **notification_sent**: Push notification successfully sent
- **notification_excluded**: Device excluded from notification with reason
- **notification_failed**: Push notification failed with error

### Sighting Events
- **sighting_reported**: New sighting reported for alert
- **sighting_dismissed**: Sighting marked as false by alert owner

### Device Events
- **device_registered**: Device registered or updated
- **device_location_updated**: GPS location updated
- **saved_zone_created**: User created saved zone

### Error Events
- **http_error**: HTTP request failed with status code and error message
- **rate_limit_exceeded**: User hit rate limit
- **validation_error**: DTO validation failed

## PII Sanitization

**NEVER logged:**
- Email addresses
- Phone numbers
- Full names
- Physical addresses
- Passwords
- Authentication tokens
- Push notification tokens
- Exact GPS coordinates (only approximate location)

Example sanitization:

```typescript
import { sanitizeLogData } from './shared/logger.config';

// Before sanitization
const data = {
  email: 'user@example.com',
  phone: '+1234567890',
  latitude: 40.712776,
  longitude: -74.005974,
};

// After sanitization
const sanitized = sanitizeLogData(data);
// {
//   email: '[REDACTED]',
//   phone: '[REDACTED]',
//   latitude: 40.71,  // Rounded to 2 decimals
//   longitude: -74.01
// }
```

## Usage in Code

### Basic Logging

```typescript
import { Logger } from '@nestjs/common';

export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  async create(userId: string, dto: CreateAlertDto) {
    this.logger.log({
      event: 'alert_created',
      user_id: userId,
      species: dto.petDetails.species,
      radius_km: dto.location.radiusKm,
    });

    // ... implementation
  }

  async handleError(error: Error, context: any) {
    this.logger.error({
      event: 'alert_creation_failed',
      error_message: error.message,
      error_name: error.name,
      stack: error.stack, // Only logged in development
      ...sanitizeLogData(context),
    });
  }
}
```

### HTTP Request/Response Logging

Automatically logged by `LoggingInterceptor`:

```json
// Incoming request
{
  "event": "http_request",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "url": "/alerts",
  "user_agent": "Mozilla/5.0...",
  "user_id": "user123"
}

// Successful response
{
  "event": "http_response",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "url": "/alerts",
  "status_code": 201,
  "duration_ms": 145,
  "user_id": "user123"
}

// Error response
{
  "event": "http_error",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "url": "/alerts",
  "status_code": 422,
  "duration_ms": 23,
  "error_message": "Validation failed",
  "error_name": "ValidationException",
  "user_id": "user123"
}
```

## Log Analysis

### Query Logs with jq

```bash
# Find all errors for a specific request
cat logs/error-2026-02-05.log | jq 'select(.request_id == "550e8400-...")'

# Count alerts created per hour
cat logs/events-2026-02-05.log | jq 'select(.event == "alert_created")' | wc -l

# Find slow requests (>1 second)
cat logs/application-2026-02-05.log | jq 'select(.duration_ms > 1000)'

# Get all rate limit violations
cat logs/application-2026-02-05.log | jq 'select(.event == "rate_limit_exceeded")'
```

### Centralized Logging

For production, forward logs to centralized logging service:

**Recommended Services:**
- **Datadog**: APM + Logs + Metrics
- **Loggly**: Log aggregation and search
- **CloudWatch**: AWS-native logging
- **Elasticsearch + Kibana**: Self-hosted

**Winston Transports Available:**
```bash
# Install transport
bun add winston-transport-datadog

# Configure in logger.config.ts
new DatadogTransport({
  apiKey: process.env.DATADOG_API_KEY,
  service: 'fifi-alert-backend',
  env: process.env.NODE_ENV,
})
```

## Monitoring Alerts

Set up alerts for critical events:

1. **Error Rate Spike**: Alert if error rate > 5% in 5 minutes
2. **Slow Requests**: Alert if p95 latency > 1 second
3. **Rate Limit Abuse**: Alert if same user_id hits rate limit > 10 times/hour
4. **Notification Failures**: Alert if notification failure rate > 10%
5. **Queue Depth**: Alert if BullMQ queue depth > 1000 jobs

## Best Practices

### DO:
- ✅ Log all critical business events (alert created, notification sent)
- ✅ Log error context (user_id, alert_id, error message)
- ✅ Use structured logging (JSON format)
- ✅ Include request_id for correlation
- ✅ Sanitize PII before logging

### DON'T:
- ❌ Log passwords or authentication tokens
- ❌ Log exact GPS coordinates (round to 2 decimals)
- ❌ Log entire request/response bodies (too large)
- ❌ Log in hot paths without consideration for performance
- ❌ Use console.log() directly (use Logger instead)

## Troubleshooting

### Logs not rotating
Check disk space and file permissions:
```bash
df -h
ls -la logs/
```

### Logs too large
Reduce retention or max file size in `logger.config.ts`:
```typescript
maxFiles: '7d', // Keep for 7 days instead of 14
maxSize: '10m', // 10MB instead of 20MB
```

### Request ID not appearing
Ensure `RequestIdMiddleware` is applied globally in `app.module.ts`:
```typescript
configure(consumer: MiddlewareConsumer) {
  consumer.apply(RequestIdMiddleware).forRoutes('*');
}
```

### Performance impact
Logging is async and shouldn't impact performance. If concerned:
1. Set LOG_LEVEL=info in production (skip debug logs)
2. Avoid logging in tight loops
3. Use sampling for high-volume events

## Configuration

Environment variables for logging:

```bash
# Log level: error | warn | info | debug
LOG_LEVEL=info

# Node environment (affects default log level)
NODE_ENV=production

# Datadog integration (optional)
DATADOG_API_KEY=your-api-key
DATADOG_APP_KEY=your-app-key

# Sentry integration (optional)
SENTRY_DSN=your-sentry-dsn
```

## Log Retention Policy

| Log Type | Retention | Reason |
|----------|-----------|--------|
| Application logs | 14 days | General troubleshooting |
| Error logs | 30 days | Debugging and patterns |
| Event logs | 30 days | Analytics and reporting |
| Archived logs (compressed) | 90 days | Compliance and audits |

After retention period, logs are automatically deleted to save disk space.
