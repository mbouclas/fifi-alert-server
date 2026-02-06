# Redis Production Setup Guide

## Overview

FiFi Alert uses Redis for job queues (BullMQ), rate limiting, and session management. This guide covers production deployment, configuration, monitoring, and best practices for Redis in the FiFi Alert backend.

**Redis Version:** 7.0+ recommended  
**Use Case:** BullMQ job queues, rate limiting, caching

---

## Table of Contents

1. [Managed Redis Providers](#managed-redis-providers)
2. [Configuration](#configuration)
3. [Persistence & Durability](#persistence--durability)
4. [Memory Management](#memory-management)
5. [High Availability](#high-availability)
6. [Security](#security)
7. [Monitoring & Alerts](#monitoring--alerts)
8. [Performance Tuning](#performance-tuning)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

---

## Managed Redis Providers

### Recommended Providers (Production)

#### 1. AWS ElastiCache for Redis

**Pros:**
- Fully managed, automatic failover
- VPC integration for security
- Automatic backups and snapshots
- CloudWatch integration

**Setup Steps:**

1. **Create ElastiCache Cluster:**
   - Go to AWS Console → ElastiCache → Redis
   - Click "Create" → Choose "Redis" engine
   - Select version: Redis 7.0+
   - Node type: `cache.t3.medium` (start small, scale up)
   - Number of replicas: 2 (for high availability)
   - Subnet group: Select your VPC subnets

2. **Configure Settings:**
   - **Cluster mode:** Disabled (simpler for BullMQ)
   - **Port:** 6379 (default)
   - **Parameter group:** `default.redis7`
   - **Encryption at rest:** Enabled
   - **Encryption in transit:** Enabled (requires TLS)
   - **Automatic backups:** Enabled (retention: 7 days)

3. **Security Group:**
   - Allow inbound TCP 6379 from application security group
   - No public access

4. **Get Connection String:**
   ```
   redis://<primary-endpoint>:6379
   ```

5. **Environment Configuration:**
   ```bash
   REDIS_HOST=<primary-endpoint>
   REDIS_PORT=6379
   REDIS_PASSWORD=<optional-if-auth-enabled>
   REDIS_TLS=true  # For encryption in transit
   ```

**Cost Estimate:**
- `cache.t3.medium` (2 vCPU, 3.09 GB): ~$50/month
- `cache.r6g.large` (2 vCPU, 13.07 GB): ~$120/month

---

#### 2. Redis Cloud (Redis Labs)

**Pros:**
- Managed by Redis creators
- Global multi-region support
- Redis Stack (RedisJSON, RedisSearch, etc.)
- Generous free tier (30MB)

**Setup Steps:**

1. **Create Account:**
   - Go to https://redis.com/try-free/
   - Sign up for Redis Cloud

2. **Create Database:**
   - Click "New Database"
   - Select cloud provider: AWS, GCP, or Azure
   - Select region: Closest to your app servers
   - Memory: 1GB (start, scale up as needed)
   - Persistence: RDB + AOF (recommended)
   - High availability: Enabled (for production)

3. **Get Connection Details:**
   - **Endpoint:** `redis-12345.c123.us-east-1-1.ec2.cloud.redislabs.com`
   - **Port:** Custom port (e.g., 12345)
   - **Password:** Provided in dashboard

4. **Environment Configuration:**
   ```bash
   REDIS_URL=redis://default:<password>@<endpoint>:<port>
   ```

**Cost Estimate:**
- Free tier: 30MB
- Essential 1GB: $7/month
- Standard 5GB: $35/month

---

#### 3. Google Cloud Memorystore

**Pros:**
- Fully managed on GCP
- VPC integration
- Automatic failover
- Stackdriver monitoring

**Setup Steps:**

1. **Create Instance:**
   - Go to GCP Console → Memorystore → Redis
   - Click "Create Instance"
   - Tier: Standard (for high availability)
   - Version: Redis 7.0
   - Capacity: 1GB (start)
   - Region: Same as your app

2. **Configure:**
   - Network: Select VPC
   - IP range: Automatic allocation
   - Persistence: RDB (enabled by default)

3. **Get Connection:**
   ```
   redis://<ip-address>:6379
   ```

4. **Environment Configuration:**
   ```bash
   REDIS_HOST=<ip-address>
   REDIS_PORT=6379
   ```

**Cost Estimate:**
- Standard 1GB: ~$50/month

---

#### 4. Azure Cache for Redis

**Pros:**
- Fully managed on Azure
- VNet integration
- Active geo-replication
- Azure Monitor integration

**Setup Steps:**

1. **Create Cache:**
   - Azure Portal → Create Resource → Azure Cache for Redis
   - Pricing tier: Standard C1 (1GB)
   - Location: Same as app
   - Redis version: 6.2+ (7.0 preview)

2. **Configure:**
   - Virtual network: Optional (for advanced security)
   - Non-SSL port: Disabled (use SSL)
   - Persistence: Enabled (RDB)

3. **Get Connection:**
   - Primary connection string in "Access keys"

4. **Environment Configuration:**
   ```bash
   REDIS_URL=rediss://:<password>@<name>.redis.cache.windows.net:6380
   ```

**Cost Estimate:**
- Basic C1 (1GB): ~$50/month
- Standard C1 (1GB + replica): ~$100/month

---

## Configuration

### Environment Variables

```bash
#########################################
# Redis Configuration
#########################################
# Option 1: Full connection string (recommended)
REDIS_URL=redis://default:password@host:6379

# Option 2: Individual settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
REDIS_DB=0  # Default database index
REDIS_TLS=false  # Set to 'true' for TLS/SSL

# Connection pool settings
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=10000  # milliseconds
REDIS_COMMAND_TIMEOUT=5000   # milliseconds
```

### BullMQ Configuration

```typescript
// src/config/redis.config.ts
import { BullModule } from '@nestjs/bull';

export const bullConfig = BullModule.forRoot({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: true,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500,     // Keep last 500 failed jobs
  },
});
```

---

## Persistence & Durability

### RDB (Redis Database) Snapshots

**When to Use:** Most use cases (default)

**Configuration:**
```bash
# In redis.conf or managed Redis settings
save 900 1      # Save after 900s if ≥1 key changed
save 300 10     # Save after 300s if ≥10 keys changed
save 60 10000   # Save after 60s if ≥10,000 keys changed
```

**Pros:**
- Fast recovery (loads entire snapshot)
- Small disk footprint
- Good for backups

**Cons:**
- Potential data loss (up to last save interval)

---

### AOF (Append-Only File)

**When to Use:** Critical job queues, payment processing

**Configuration:**
```bash
# Enable AOF
appendonly yes
appendfilename "appendonly.aof"

# Fsync policy (durability vs performance)
appendfsync everysec  # Recommended: fsync every second
# appendfsync always  # Safest but slow
# appendfsync no      # Fast but risky
```

**Pros:**
- Maximum durability (1-second data loss max with `everysec`)
- More reliable for job queues

**Cons:**
- Larger disk usage
- Slower recovery

---

### Hybrid (RDB + AOF) - **RECOMMENDED**

**Best of both worlds:**
```bash
# Enable both
save 900 1
appendonly yes
appendfsync everysec
```

AWS ElastiCache and Redis Cloud support this out-of-the-box.

---

## Memory Management

### Memory Limit Configuration

```bash
# Set max memory (e.g., 2GB)
maxmemory 2gb

# Eviction policy (CRITICAL for rate limiting and queues)
maxmemory-policy allkeys-lru  # Recommended for mixed workloads
```

### Eviction Policies

| Policy | Use Case | Notes |
|--------|----------|-------|
| `noeviction` | Job queues only | Returns errors when memory full |
| `allkeys-lru` | **Mixed workloads** | Evicts least recently used keys |
| `volatile-lru` | Cache + queues | Only evicts keys with TTL set |
| `allkeys-lfu` | Cache-heavy | Evicts least frequently used keys |

**For FiFi Alert:** Use `allkeys-lru`
- Rate limiting data has TTL (expires automatically)
- BullMQ jobs are transient
- Allows Redis to manage memory automatically

---

### Memory Monitoring

```bash
# Check current memory usage
redis-cli INFO memory

# Key metrics:
# - used_memory_human: Current memory usage
# - used_memory_peak_human: Peak usage
# - mem_fragmentation_ratio: Should be ~1.0-1.5
```

**Alert Thresholds:**
- Warning: 75% memory usage
- Critical: 90% memory usage

---

## High Availability

### Redis Sentinel (Self-Hosted)

**Architecture:**
- 1 Primary (master)
- 2+ Replicas (slaves)
- 3+ Sentinels (monitoring)

**Setup:**
```bash
# sentinel.conf
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel parallel-syncs mymaster 1
sentinel failover-timeout mymaster 10000
```

**Not recommended** for production unless you have dedicated DevOps team.

---

### Managed High Availability

**AWS ElastiCache:** Multi-AZ replication (automatic)  
**Redis Cloud:** High availability toggle (automatic)  
**Google Memorystore:** Standard tier (automatic)  
**Azure Cache:** Standard/Premium tier (automatic)

**Configuration in App:**
```typescript
// Use Sentinel-aware connection
redis: {
  sentinels: [
    { host: 'sentinel1', port: 26379 },
    { host: 'sentinel2', port: 26379 },
    { host: 'sentinel3', port: 26379 },
  ],
  name: 'mymaster',
}
```

---

## Security

### Authentication

```bash
# Set password in redis.conf
requirepass your_strong_password_here

# Or in managed Redis (via console)
```

**In App:**
```bash
REDIS_PASSWORD=your_strong_password_here
```

---

### TLS/SSL Encryption

**AWS ElastiCache:**
- Enable "Encryption in transit"
- Use `rediss://` protocol

**Redis Cloud:**
- TLS enabled by default on paid plans

**Configuration:**
```typescript
redis: {
  host: 'my-cluster.cache.amazonaws.com',
  port: 6379,
  tls: {
    // Empty object enables TLS
  },
}
```

---

### Network Security

- **VPC/VNet:** Deploy Redis in private subnet
- **Security Groups:** Only allow access from app servers
- **No Public Access:** Never expose Redis to internet
- **IP Whitelisting:** Restrict to known IPs (if self-hosted)

---

## Monitoring & Alerts

### Key Metrics to Monitor

| Metric | Alert Threshold | Description |
|--------|----------------|-------------|
| **Memory Usage** | > 75% | Used memory / max memory |
| **Evicted Keys** | > 100/min | Keys removed due to memory pressure |
| **Connection Count** | > 90% of max | Active client connections |
| **Command Latency** | > 10ms (p95) | Time to execute commands |
| **Queue Depth** | > 1000 jobs | BullMQ waiting jobs |
| **Hit Rate** | < 80% | Cache hit rate (if using cache) |
| **Replication Lag** | > 5 seconds | Delay between master and replica |

---

### Monitoring Tools

**AWS CloudWatch (ElastiCache):**
- Automatic metrics collection
- Set alarms on memory, CPU, evictions

**Redis Cloud:**
- Built-in dashboard
- Real-time metrics

**Prometheus + Grafana (Self-Hosted):**
```bash
# Install redis_exporter
docker run -d --name redis_exporter \
  -p 9121:9121 \
  oliver006/redis_exporter \
  --redis.addr=redis://localhost:6379
```

**Application Monitoring:**
```typescript
// Log BullMQ queue metrics
queue.on('global:completed', (jobId) => {
  logger.info({ event: 'queue_job_completed', jobId });
});

queue.on('global:failed', (jobId, error) => {
  logger.error({ event: 'queue_job_failed', jobId, error });
});
```

---

## Performance Tuning

### Connection Pooling

```typescript
// ioredis connection pool
redis: {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
}
```

---

### BullMQ Job Concurrency

```typescript
// Process jobs concurrently
@Processor('notification-queue')
export class NotificationProcessor {
  @Process({ name: 'send-push', concurrency: 5 })
  async processPush(job: Job) {
    // Process up to 5 jobs simultaneously
  }
}
```

---

### Redis Pipelining (Batch Commands)

```typescript
// Batch multiple commands
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.set('key3', 'value3');
await pipeline.exec();
```

---

## Troubleshooting

### Issue: "MISCONF Redis is configured to save RDB snapshots"

**Cause:** Disk full or permission error

**Solution:**
```bash
# Check disk space
df -h

# Disable RDB temporarily (not recommended)
redis-cli CONFIG SET save ""

# Or fix disk space and restart
```

---

### Issue: High memory usage / Evictions

**Diagnosis:**
```bash
redis-cli INFO memory
redis-cli INFO stats | grep evicted_keys
```

**Solutions:**
- Increase Redis memory (scale up instance)
- Reduce job retention: `removeOnComplete: 10`
- Check for memory leaks in app
- Verify `maxmemory-policy` is set correctly

---

### Issue: Slow job processing

**Diagnosis:**
```bash
# Check queue depth
redis-cli LLEN "bull:notification-queue:wait"

# Check active jobs
redis-cli LLEN "bull:notification-queue:active"
```

**Solutions:**
- Increase worker concurrency
- Scale horizontally (more worker instances)
- Optimize job processing logic
- Check for job timeouts

---

### Issue: Connection timeouts

**Diagnosis:**
```bash
# Check connection count
redis-cli INFO clients | grep connected_clients

# Check network latency
ping <redis-host>
```

**Solutions:**
- Increase connection pool size
- Check network security groups
- Verify Redis is accepting connections
- Check for DNS issues

---

## Best Practices

### DO

✅ **Use managed Redis in production** (ElastiCache, Redis Cloud, etc.)  
✅ **Enable both RDB and AOF persistence** for job queues  
✅ **Set `maxmemory` and `maxmemory-policy allkeys-lru`**  
✅ **Monitor memory, queue depth, and evictions**  
✅ **Use connection pooling** with retry logic  
✅ **Secure with password authentication and TLS**  
✅ **Deploy in private VPC/subnet**  
✅ **Set up automatic backups** (daily snapshots)  
✅ **Test failover procedures** in staging  
✅ **Clean up old job data** (`removeOnComplete`, `removeOnFail`)

---

### DON'T

❌ **Don't expose Redis to public internet**  
❌ **Don't use default password or no password**  
❌ **Don't run Redis on the same server as your app** (single point of failure)  
❌ **Don't ignore memory alerts** (will cause evictions)  
❌ **Don't store large objects** (> 1MB per key)  
❌ **Don't use Redis as primary database** (use PostgreSQL)  
❌ **Don't skip backups** (test restore procedures)  
❌ **Don't use blocking commands** in production (`BLPOP`, `BRPOP` - use BullMQ instead)

---

## Quick Reference

### Essential Redis Commands

```bash
# Check connection
redis-cli ping

# Get memory info
redis-cli INFO memory

# Get queue stats
redis-cli LLEN "bull:notification-queue:wait"
redis-cli LLEN "bull:notification-queue:active"
redis-cli LLEN "bull:notification-queue:completed"
redis-cli LLEN "bull:notification-queue:failed"

# Clear queue (DANGER - production)
redis-cli DEL "bull:notification-queue:wait"

# Get all keys matching pattern
redis-cli KEYS "bull:*"

# Monitor commands in real-time
redis-cli MONITOR

# Check replication status
redis-cli INFO replication
```

---

## Cost Optimization

### Development

- Use **Docker Redis** locally (free)
- Use **Redis Cloud free tier** (30MB)

### Staging

- **AWS ElastiCache:** `cache.t3.micro` (~$12/month)
- **Redis Cloud Essential:** 250MB (~$3/month)

### Production

- **AWS ElastiCache:** `cache.t3.medium` with replica (~$100/month)
- **Redis Cloud Standard:** 5GB (~$35/month)

---

## Additional Resources

- **Redis Documentation:** https://redis.io/docs/
- **BullMQ Documentation:** https://docs.bullmq.io/
- **AWS ElastiCache Best Practices:** https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/BestPractices.html
- **FiFi Alert Operational Runbook:** [OPERATIONAL_RUNBOOK.md](./OPERATIONAL_RUNBOOK.md)

---

## Support

For Redis issues in FiFi Alert:

1. Check logs: `logs/error-*.log`
2. Check queue depth: `redis-cli LLEN "bull:notification-queue:wait"`
3. Check Redis memory: `redis-cli INFO memory`
4. Consult [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
5. Contact DevOps team or cloud provider support
