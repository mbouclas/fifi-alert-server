/**
 * Alert Zone Performance Testing Script
 * 
 * Tests PostGIS query performance for alert zone matching.
 * Verifies GIST index usage and measures query times.
 * 
 * Usage:
 *   bun run scripts/test-alert-zone-performance.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma-lib/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const { Pool } = pg;

// Initialize Prisma with adapter
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 10,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

interface PerformanceResult {
    testName: string;
    zoneCount: number;
    userCount: number;
    queryTimeMs: number;
    indexUsed: boolean;
    queryPlan: string;
}

async function testAlertZoneQuery(
    alertLat: number,
    alertLon: number,
    alertRadiusKm: number,
): Promise<{ executionTimeMs: number; matches: number }> {
    const startTime = performance.now();

    const matches = await prisma.$queryRaw<any[]>`
    SELECT 
      d.id as device_id,
      d.user_id,
      d.push_token,
      az.id as zone_id,
      az.name as zone_name,
      az.radius_meters,
      ST_Distance(
        az.location_point::geography,
        ST_SetSRID(ST_MakePoint(${alertLon}, ${alertLat}), 4326)::geography
      ) as distance_meters
    FROM alert_zone az
    INNER JOIN "user" u ON az.user_id = u.id
    INNER JOIN device d ON d.user_id = u.id
    WHERE az.is_active = true
      AND d.push_token IS NOT NULL
      AND d.push_enabled = true
      AND u.banned = false
      AND ST_DWithin(
        az.location_point::geography,
        ST_SetSRID(ST_MakePoint(${alertLon}, ${alertLat}), 4326)::geography,
        (az.radius_meters + (${alertRadiusKm} * 1000))
      )
    ORDER BY az.priority DESC, distance_meters ASC
  `;

    const endTime = performance.now();
    return {
        executionTimeMs: endTime - startTime,
        matches: matches.length,
    };
}

async function getQueryPlan(
    alertLat: number,
    alertLon: number,
    alertRadiusKm: number,
): Promise<any[]> {
    const plan = await prisma.$queryRaw<any[]>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT 
      d.id as device_id,
      d.user_id,
      d.push_token,
      az.id as zone_id,
      az.name as zone_name,
      az.radius_meters,
      ST_Distance(
        az.location_point::geography,
        ST_SetSRID(ST_MakePoint(${alertLon}, ${alertLat}), 4326)::geography
      ) as distance_meters
    FROM alert_zone az
    INNER JOIN "user" u ON az.user_id = u.id
    INNER JOIN device d ON d.user_id = u.id
    WHERE az.is_active = true
      AND d.push_token IS NOT NULL
      AND d.push_enabled = true
      AND u.banned = false
      AND ST_DWithin(
        az.location_point::geography,
        ST_SetSRID(ST_MakePoint(${alertLon}, ${alertLat}), 4326)::geography,
        (az.radius_meters + (${alertRadiusKm} * 1000))
      )
    ORDER BY az.priority DESC, distance_meters ASC
  `;

    return plan;
}

function checkGistIndexUsed(queryPlan: any[]): boolean {
    const planJson = JSON.stringify(queryPlan, null, 2);

    // Look for "Index Scan using" with GIST index name
    const hasGistIndex = planJson.includes('gist') ||
        planJson.includes('GIST') ||
        planJson.includes('idx_alert_zones_location_gist') ||
        planJson.includes('Index Scan');

    return hasGistIndex;
}

async function createTestData(userCount: number, zonesPerUser: number): Promise<void> {
    console.log(`\n📝 Creating test data: ${userCount} users with ${zonesPerUser} zones each...`);

    // San Francisco coordinates (center)
    const sfLat = 37.7749;
    const sfLon = -122.4194;

    for (let i = 0; i < userCount; i++) {
        // Create user
        const user = await prisma.user.create({
            data: {
                email: `perf-test-user-${i}-${Date.now()}@example.com`,
                name: `Test User ${i}`,
                banned: false,
            },
        });

        // Create zones for this user (spread around SF)
        for (let j = 0; j < zonesPerUser; j++) {
            // Slightly randomize coordinates within ~5km of SF center
            const latOffset = (Math.random() - 0.5) * 0.05; // ~5km
            const lonOffset = (Math.random() - 0.5) * 0.05;

            const zoneLat = sfLat + latOffset;
            const zoneLon = sfLon + lonOffset;
            const radiusMeters = 500 + Math.floor(Math.random() * 1500); // 500-2000m

            await prisma.$executeRaw`
        INSERT INTO alert_zone (user_id, name, lat, lon, location_point, radius_meters, is_active, priority, created_at, updated_at)
        VALUES (
          ${user.id},
          ${`Zone ${j + 1}`},
          ${zoneLat},
          ${zoneLon},
          ST_SetSRID(ST_MakePoint(${zoneLon}, ${zoneLat}), 4326),
          ${radiusMeters},
          true,
          ${j},
          NOW(),
          NOW()
        )
      `;
        }

        // Create a device for this user
        const timestamp = Date.now();
        await prisma.device.create({
            data: {
                user_id: user.id,
                device_uuid: `perf-test-device-uuid-${i}-${timestamp}`,
                platform: i % 2 === 0 ? 'IOS' : 'ANDROID',
                os_version: '17.0',
                app_version: '1.0.0',
                push_token: `test-token-${i}-${timestamp}`,
                push_enabled: true,
                last_app_open: new Date(),
            },
        });
    }

    console.log(`✅ Created ${userCount} users, ${userCount * zonesPerUser} zones, ${userCount} devices`);
}

async function cleanupTestData(): Promise<void> {
    console.log('\n🧹 Cleaning up test data...');

    // Delete test users (cascade will delete zones and devices)
    const deleted = await prisma.user.deleteMany({
        where: {
            email: {
                contains: 'perf-test-user-',
            },
        },
    });

    console.log(`✅ Cleaned up ${deleted.count} test users`);
}

async function runPerformanceTests(): Promise<PerformanceResult[]> {
    const results: PerformanceResult[] = [];

    // Test location: San Francisco center
    const testLat = 37.7749;
    const testLon = -122.4194;
    const testRadiusKm = 3;

    console.log('\n📊 Running Performance Tests');
    console.log('='.repeat(60));

    // Test 1: Current database state (baseline)
    console.log('\n🧪 Test 1: Baseline (current database)');
    const currentZones = await prisma.alertZone.count();
    const currentUsers = await prisma.user.count();
    console.log(`   Current: ${currentUsers} users, ${currentZones} alert zones`);

    const baseline = await testAlertZoneQuery(testLat, testLon, testRadiusKm);
    console.log(`   ⏱️  Query time: ${baseline.executionTimeMs.toFixed(2)}ms`);
    console.log(`   📍 Matches found: ${baseline.matches}`);

    const baselinePlan = await getQueryPlan(testLat, testLon, testRadiusKm);
    const baselineUsesGist = checkGistIndexUsed(baselinePlan);
    console.log(`   🔍 GIST index used: ${baselineUsesGist ? '✅ YES' : '❌ NO'}`);

    results.push({
        testName: 'Baseline (current DB)',
        zoneCount: currentZones,
        userCount: currentUsers,
        queryTimeMs: baseline.executionTimeMs,
        indexUsed: baselineUsesGist,
        queryPlan: JSON.stringify(baselinePlan, null, 2),
    });

    // Test 2: 100 users with 5 zones each = 500 zones
    console.log('\n🧪 Test 2: 100 users × 5 zones = 500 zones');
    await createTestData(100, 5);

    const test2 = await testAlertZoneQuery(testLat, testLon, testRadiusKm);
    console.log(`   ⏱️  Query time: ${test2.executionTimeMs.toFixed(2)}ms`);
    console.log(`   📍 Matches found: ${test2.matches}`);

    const test2Plan = await getQueryPlan(testLat, testLon, testRadiusKm);
    const test2UsesGist = checkGistIndexUsed(test2Plan);
    console.log(`   🔍 GIST index used: ${test2UsesGist ? '✅ YES' : '❌ NO'}`);

    const test2Zones = await prisma.alertZone.count();
    results.push({
        testName: '100 users × 5 zones',
        zoneCount: test2Zones,
        userCount: currentUsers + 100,
        queryTimeMs: test2.executionTimeMs,
        indexUsed: test2UsesGist,
        queryPlan: JSON.stringify(test2Plan, null, 2),
    });

    // Test 3: 1000 users with 5 zones each = 5000 zones
    console.log('\n🧪 Test 3: 1000 users × 5 zones = 5000 zones');
    await createTestData(900, 5); // Already have 100 from test 2

    const test3 = await testAlertZoneQuery(testLat, testLon, testRadiusKm);
    console.log(`   ⏱️  Query time: ${test3.executionTimeMs.toFixed(2)}ms`);
    console.log(`   📍 Matches found: ${test3.matches}`);

    const test3Plan = await getQueryPlan(testLat, testLon, testRadiusKm);
    const test3UsesGist = checkGistIndexUsed(test3Plan);
    console.log(`   🔍 GIST index used: ${test3UsesGist ? '✅ YES' : '❌ NO'}`);

    const test3Zones = await prisma.alertZone.count();
    results.push({
        testName: '1000 users × 5 zones',
        zoneCount: test3Zones,
        userCount: currentUsers + 1000,
        queryTimeMs: test3.executionTimeMs,
        indexUsed: test3UsesGist,
        queryPlan: JSON.stringify(test3Plan, null, 2),
    });

    // Cleanup test data
    await cleanupTestData();

    return results;
}

function printSummary(results: PerformanceResult[]): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(60));

    console.log('\n| Test | Zones | Query Time | Index Used | Pass/Fail |');
    console.log('|------|-------|------------|------------|-----------|');

    const TARGET_MS = 50;

    for (const result of results) {
        const pass = result.queryTimeMs < TARGET_MS && result.indexUsed;
        const status = pass ? '✅ PASS' : '❌ FAIL';
        const indexStatus = result.indexUsed ? '✅' : '❌';

        console.log(
            `| ${result.testName.padEnd(20)} | ${String(result.zoneCount).padStart(5)} | ${result.queryTimeMs.toFixed(2).padStart(8)}ms | ${indexStatus.padStart(10)} | ${status.padEnd(9)} |`
        );
    }

    console.log('\n📋 Performance Criteria:');
    console.log(`   • Target query time: <${TARGET_MS}ms`);
    console.log(`   • GIST index must be used`);

    const allPass = results.every(r => r.queryTimeMs < TARGET_MS && r.indexUsed);

    if (allPass) {
        console.log('\n✅ ALL TESTS PASSED - Performance is acceptable');
    } else {
        console.log('\n⚠️  SOME TESTS FAILED - Optimization needed');

        const slowTests = results.filter(r => r.queryTimeMs >= TARGET_MS);
        if (slowTests.length > 0) {
            console.log('\n   Slow queries detected:');
            slowTests.forEach(t => {
                console.log(`   • ${t.testName}: ${t.queryTimeMs.toFixed(2)}ms (target: <${TARGET_MS}ms)`);
            });
        }

        const noIndexTests = results.filter(r => !r.indexUsed);
        if (noIndexTests.length > 0) {
            console.log('\n   GIST index not used in:');
            noIndexTests.forEach(t => {
                console.log(`   • ${t.testName}`);
            });
            console.log('\n   ⚠️  This is a critical issue! Check index creation.');
        }
    }

    console.log('\n💡 Recommendations:');
    if (results.some(r => !r.indexUsed)) {
        console.log('   1. Verify GIST index exists: SELECT indexname FROM pg_indexes WHERE indexname LIKE \'%alert_zone%\';');
        console.log('   2. Check index is on location_point column');
        console.log('   3. Ensure PostGIS extension is loaded');
    }

    if (results.some(r => r.queryTimeMs >= TARGET_MS)) {
        console.log('   1. Consider adding a covering index on commonly queried columns');
        console.log('   2. Review JOIN order in query plan');
        console.log('   3. Consider Redis caching for frequently accessed zones');
    }
}

async function verifyIndexes(): Promise<void> {
    console.log('\n🔍 Verifying Alert Zone Indexes');
    console.log('='.repeat(60));

    const indexes = await prisma.$queryRaw<any[]>`
    SELECT 
      indexname,
      indexdef
    FROM pg_indexes 
    WHERE tablename = 'alert_zone'
    ORDER BY indexname;
  `;

    console.log('\n📋 Existing indexes on alert_zone table:\n');

    if (indexes.length === 0) {
        console.log('   ⚠️  NO INDEXES FOUND - This is a problem!');
        return;
    }

    let hasGistIndex = false;

    for (const idx of indexes) {
        console.log(`   • ${idx.indexname}`);
        console.log(`     ${idx.indexdef}`);

        if (idx.indexdef.toLowerCase().includes('gist')) {
            hasGistIndex = true;
            console.log('     ✅ GIST spatial index');
        }
        console.log('');
    }

    if (!hasGistIndex) {
        console.log('   ⚠️  WARNING: No GIST index found on location_point!');
        console.log('   This will cause poor performance on spatial queries.');
        console.log('\n   To fix, run:');
        console.log('   CREATE INDEX idx_alert_zone_location_gist ON alert_zone USING GIST(location_point);');
    } else {
        console.log('   ✅ GIST spatial index is present');
    }
}

async function main() {
    console.log('🚀 Alert Zone Performance Testing');
    console.log('='.repeat(60));

    try {
        // Step 1: Verify indexes exist
        await verifyIndexes();

        // Step 2: Run performance tests
        const results = await runPerformanceTests();

        // Step 3: Print summary
        printSummary(results);

        console.log('\n✅ Performance testing complete');

    } catch (error) {
        console.error('❌ Error during performance testing:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
