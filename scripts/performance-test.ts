#!/usr/bin/env bun
/**
 * Performance Testing Script
 * 
 * Tests system performance under load:
 * - Task 8.5: Alert creation (100 sequential, target p95 < 500ms)
 * - Task 8.6: Geospatial queries (10k devices, target p95 < 300ms)
 * - Task 8.7: Notification targeting (10k devices, target < 5s)
 * 
 * Usage:
 *   bun run scripts/performance-test.ts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient({
    log: ['error', 'warn'],
});

const TEST_USER_EMAIL = 'perf-test-user@test.com';
const TEST_USER_NAME = 'Performance Test User';

// Performance metrics storage
interface PerformanceMetrics {
    latencies: number[];
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    mean: number;
}

/**
 * Calculate percentile from sorted array
 */
function calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index];
}

/**
 * Calculate performance metrics from latency array
 */
function calculateMetrics(latencies: number[]): PerformanceMetrics {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = latencies.reduce((a, b) => a + b, 0);

    return {
        latencies,
        p50: calculatePercentile(sorted, 50),
        p95: calculatePercentile(sorted, 95),
        p99: calculatePercentile(sorted, 99),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: sum / latencies.length,
    };
}

/**
 * Print formatted performance metrics
 */
function printMetrics(testName: string, metrics: PerformanceMetrics, target?: { metric: string; value: number }) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 ${testName}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Samples:     ${metrics.latencies.length}`);
    console.log(`Min:         ${metrics.min.toFixed(2)}ms`);
    console.log(`Max:         ${metrics.max.toFixed(2)}ms`);
    console.log(`Mean:        ${metrics.mean.toFixed(2)}ms`);
    console.log(`P50:         ${metrics.p50.toFixed(2)}ms`);
    console.log(`P95:         ${metrics.p95.toFixed(2)}ms`);
    console.log(`P99:         ${metrics.p99.toFixed(2)}ms`);

    if (target) {
        const value = metrics[target.metric as keyof PerformanceMetrics] as number;
        const pass = value < target.value;
        console.log(`\nTarget:      ${target.metric.toUpperCase()} < ${target.value}ms`);
        console.log(`Result:      ${value.toFixed(2)}ms ${pass ? '✅ PASS' : '❌ FAIL'}`);
    }

    console.log(`${'='.repeat(60)}\n`);
}

/**
 * Task 8.5: Test alert creation performance
 * Target: p95 < 500ms
 */
async function testAlertCreationPerformance(): Promise<void> {
    console.log('\n🔥 Starting Task 8.5: Alert Creation Performance Test\n');

    // Create test user
    const testUser = await prisma.user.upsert({
        where: { email: TEST_USER_EMAIL },
        create: {
            email: TEST_USER_EMAIL,
            name: TEST_USER_NAME,
            emailVerified: false,
        },
        update: {},
    });

    console.log(`✅ Test user created: ${testUser.id}`);

    const latencies: number[] = [];
    const totalAlerts = 100;

    console.log(`Creating ${totalAlerts} alerts sequentially...\n`);

    for (let i = 0; i < totalAlerts; i++) {
        const alertData = {
            pet: {
                name: `PerfTestPet${i}`,
                species: 'DOG',
                breed: 'Labrador',
                description: `Performance test pet number ${i}`,
                color: 'Brown',
                age_years: 3,
                photos: [],
            },
            location: {
                latitude: 40.7580 + (i * 0.0001), // Vary location slightly
                longitude: -73.9855 + (i * 0.0001),
                address: `Test Location ${i}, New York, NY`,
                last_seen_time: new Date().toISOString(),
                radius_km: 5,
            },
            contact: {
                phone: '+1234567890',
                email: TEST_USER_EMAIL,
                is_phone_public: false,
            },
        };

        const startTime = performance.now();

        try {
            await prisma.alert.create({
                data: {
                    creator_id: testUser.id,
                    status: 'ACTIVE',
                    pet_name: alertData.pet.name,
                    pet_species: alertData.pet.species,
                    pet_breed: alertData.pet.breed,
                    pet_description: alertData.pet.description,
                    pet_color: alertData.pet.color,
                    pet_age_years: alertData.pet.age_years,
                    pet_photos: alertData.pet.photos,
                    location_latitude: alertData.location.latitude,
                    location_longitude: alertData.location.longitude,
                    location_address: alertData.location.address,
                    location_radius_km: alertData.location.radius_km,
                    last_seen_at: new Date(alertData.location.last_seen_time),
                    contact_phone: alertData.contact.phone,
                    contact_email: alertData.contact.email,
                    is_contact_phone_public: alertData.contact.is_phone_public,
                    created_at: new Date(),
                    updated_at: new Date(),
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    renewal_count: 0,
                },
            });

            const endTime = performance.now();
            const latency = endTime - startTime;
            latencies.push(latency);

            if ((i + 1) % 10 === 0) {
                console.log(`  Progress: ${i + 1}/${totalAlerts} alerts created`);
            }
        } catch (error) {
            console.error(`  ❌ Error creating alert ${i}:`, error);
        }
    }

    const metrics = calculateMetrics(latencies);
    printMetrics('Alert Creation Performance', metrics, { metric: 'p95', value: 500 });

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.alert.deleteMany({ where: { creator_id: testUser.id } });
    console.log('✅ Cleanup complete');
}

/**
 * Task 8.6: Test geospatial query performance
 * Target: p95 < 300ms
 */
async function testGeospatialQueryPerformance(): Promise<void> {
    console.log('\n🔥 Starting Task 8.6: Geospatial Query Performance Test\n');

    // Create test user
    const testUser = await prisma.user.upsert({
        where: { email: TEST_USER_EMAIL },
        create: {
            email: TEST_USER_EMAIL,
            name: TEST_USER_NAME,
            emailVerified: false,
        },
        update: {},
    });

    // Check existing device count
    const existingDevices = await prisma.device.count();
    console.log(`Existing devices in database: ${existingDevices}`);

    // Seed 10,000 devices if needed
    const targetDevices = 10000;
    if (existingDevices < targetDevices) {
        console.log(`\n📝 Seeding ${targetDevices - existingDevices} devices...`);

        const devicesToCreate = targetDevices - existingDevices;
        const batchSize = 1000;

        for (let batch = 0; batch < Math.ceil(devicesToCreate / batchSize); batch++) {
            const devices = [];
            const startIdx = batch * batchSize;
            const endIdx = Math.min(startIdx + batchSize, devicesToCreate);

            for (let i = startIdx; i < endIdx; i++) {
                // Distribute devices across NYC area
                const lat = 40.7128 + (Math.random() - 0.5) * 0.2; // ±0.1 degrees (~11km)
                const lon = -74.0060 + (Math.random() - 0.5) * 0.2;

                devices.push({
                    user_id: testUser.id,
                    device_uuid: `perf-test-device-${i}`,
                    platform: i % 2 === 0 ? 'IOS' : 'ANDROID',
                    os_version: '16.0',
                    app_version: '1.0.0',
                    push_token: `token${i}`.repeat(20),
                    gps_latitude: lat,
                    gps_longitude: lon,
                    gps_updated_at: new Date(),
                    postal_codes: [`1000${i % 100}`],
                    last_app_open: new Date(),
                    created_at: new Date(),
                    updated_at: new Date(),
                });
            }

            await prisma.device.createMany({ data: devices });
            console.log(`  Batch ${batch + 1}/${Math.ceil(devicesToCreate / batchSize)} seeded`);
        }

        console.log(`✅ ${devicesToCreate} devices seeded`);
    }

    // Create test alert in center of NYC
    const testAlert = await prisma.alert.create({
        data: {
            creator_id: testUser.id,
            status: 'ACTIVE',
            pet_name: 'GeoTestPet',
            pet_species: 'DOG',
            pet_breed: 'Mixed',
            pet_description: 'Geospatial performance test',
            pet_color: 'Brown',
            pet_age_years: 2,
            pet_photos: [],
            location_latitude: 40.7128,
            location_longitude: -74.0060,
            location_address: 'NYC, New York',
            location_radius_km: 10,
            last_seen_at: new Date(),
            contact_phone: '+1234567890',
            contact_email: TEST_USER_EMAIL,
            is_contact_phone_public: false,
            created_at: new Date(),
            updated_at: new Date(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            renewal_count: 0,
        },
    });

    console.log(`\nRunning geospatial queries (10km radius)...\n`);

    const latencies: number[] = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        // Execute geospatial query
        await prisma.$queryRaw`
      SELECT 
        d.id,
        d.device_uuid,
        ST_Distance(
          d.gps_point::geography,
          ST_SetSRID(ST_MakePoint(${testAlert.location_longitude}, ${testAlert.location_latitude}), 4326)::geography
        ) / 1000 as distance_km
      FROM "Device" d
      WHERE d.gps_point IS NOT NULL
        AND ST_DWithin(
          d.gps_point::geography,
          ST_SetSRID(ST_MakePoint(${testAlert.location_longitude}, ${testAlert.location_latitude}), 4326)::geography,
          ${testAlert.location_radius_km * 1000}
        )
      ORDER BY distance_km
      LIMIT 100
    `;

        const endTime = performance.now();
        const latency = endTime - startTime;
        latencies.push(latency);

        if ((i + 1) % 10 === 0) {
            console.log(`  Progress: ${i + 1}/${iterations} queries executed`);
        }
    }

    const metrics = calculateMetrics(latencies);
    printMetrics('Geospatial Query Performance', metrics, { metric: 'p95', value: 300 });

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.alert.delete({ where: { id: testAlert.id } });
    console.log('✅ Cleanup complete (devices preserved for future tests)');
}

/**
 * Task 8.7: Test notification targeting performance
 * Target: < 5 seconds for 10k devices
 */
async function testNotificationTargetingPerformance(): Promise<void> {
    console.log('\n🔥 Starting Task 8.7: Notification Targeting Performance Test\n');

    // Create test user
    const testUser = await prisma.user.upsert({
        where: { email: TEST_USER_EMAIL },
        create: {
            email: TEST_USER_EMAIL,
            name: TEST_USER_NAME,
            emailVerified: false,
        },
        update: {},
    });

    // Verify device count
    const deviceCount = await prisma.device.count();
    console.log(`Total devices in database: ${deviceCount}`);

    if (deviceCount < 1000) {
        console.log('\n⚠️  Warning: Less than 1,000 devices found');
        console.log('   Run Task 8.6 first to seed 10,000 devices');
        console.log('   Proceeding with available devices...\n');
    }

    // Create test alert
    const testAlert = await prisma.alert.create({
        data: {
            creator_id: testUser.id,
            status: 'ACTIVE',
            pet_name: 'NotificationTestPet',
            pet_species: 'CAT',
            pet_breed: 'Siamese',
            pet_description: 'Notification targeting performance test',
            pet_color: 'White',
            pet_age_years: 1,
            pet_photos: [],
            location_latitude: 40.7128,
            location_longitude: -74.0060,
            location_address: 'NYC, New York',
            location_radius_km: 10,
            last_seen_at: new Date(),
            contact_phone: '+1234567890',
            contact_email: TEST_USER_EMAIL,
            is_contact_phone_public: false,
            created_at: new Date(),
            updated_at: new Date(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            renewal_count: 0,
        },
    });

    console.log(`Test alert created: ${testAlert.id}\n`);
    console.log('Simulating notification targeting process...\n');

    const startTime = performance.now();

    // Step 1: Find devices within radius
    console.log('  Step 1: Finding devices within radius...');
    const step1Start = performance.now();
    const matchingDevices = await prisma.$queryRaw<any[]>`
    SELECT 
      d.id,
      d.device_uuid,
      d.platform,
      d.push_token,
      ST_Distance(
        d.gps_point::geography,
        ST_SetSRID(ST_MakePoint(${testAlert.location_longitude}, ${testAlert.location_latitude}), 4326)::geography
      ) / 1000 as distance_km
    FROM "Device" d
    WHERE d.gps_point IS NOT NULL
      AND ST_DWithin(
        d.gps_point::geography,
        ST_SetSRID(ST_MakePoint(${testAlert.location_longitude}, ${testAlert.location_latitude}), 4326)::geography,
        ${testAlert.location_radius_km * 1000}
      )
  `;
    const step1Time = performance.now() - step1Start;
    console.log(`    ✅ Found ${matchingDevices.length} devices in ${step1Time.toFixed(2)}ms`);

    // Step 2: Create notification records
    console.log('  Step 2: Creating notification records...');
    const step2Start = performance.now();
    const notifications = matchingDevices.slice(0, 1000).map((device) => ({
        alert_id: testAlert.id,
        device_id: device.id,
        status: 'QUEUED',
        confidence: 'HIGH',
        match_reason: 'GPS_FRESH',
        distance_km: parseFloat(device.distance_km),
        notification_title: `Missing ${testAlert.pet_species}: ${testAlert.pet_name}`,
        notification_body: testAlert.pet_description,
        excluded: false,
        created_at: new Date(),
        updated_at: new Date(),
    }));

    if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
    }
    const step2Time = performance.now() - step2Start;
    console.log(`    ✅ Created ${notifications.length} notification records in ${step2Time.toFixed(2)}ms`);

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Notification Targeting Performance`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Devices Processed:     ${matchingDevices.length}`);
    console.log(`Notifications Created: ${notifications.length}`);
    console.log(`Step 1 Time:           ${step1Time.toFixed(2)}ms`);
    console.log(`Step 2 Time:           ${step2Time.toFixed(2)}ms`);
    console.log(`Total Time:            ${totalTime.toFixed(2)}ms (${(totalTime / 1000).toFixed(2)}s)`);
    console.log(`\nTarget:                < 5000ms (5s)`);
    console.log(`Result:                ${totalTime < 5000 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.notification.deleteMany({ where: { alert_id: testAlert.id } });
    await prisma.alert.delete({ where: { id: testAlert.id } });
    console.log('✅ Cleanup complete');
}

/**
 * Main execution
 */
async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 FiFi Alert Performance Testing Suite');
    console.log('='.repeat(60));

    try {
        // Task 8.5: Alert creation performance
        await testAlertCreationPerformance();

        // Task 8.6: Geospatial query performance
        await testGeospatialQueryPerformance();

        // Task 8.7: Notification targeting performance
        await testNotificationTargetingPerformance();

        console.log('\n✅ All performance tests completed!\n');
    } catch (error) {
        console.error('\n❌ Performance test failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
