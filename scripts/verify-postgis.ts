#!/usr/bin/env bun
/**
 * Verify PostGIS Extension and Test Spatial Queries
 * 
 * This script verifies:
 * 1. PostGIS extension is enabled
 * 2. All spatial indexes (GIST) are created
 * 3. Basic spatial queries work correctly
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Verifying PostGIS setup...\n');

    try {
        // Check PostGIS version
        const postgisVersion = await prisma.$queryRaw<Array<{ postgis_version: string }>>`
      SELECT PostGIS_Version() as postgis_version;
    `;
        console.log('✅ PostGIS Version:', postgisVersion[0].postgis_version);

        // Verify spatial indexes exist
        const indexes = await prisma.$queryRaw<Array<{ tablename: string; indexname: string }>>`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE indexname LIKE '%gist%'
      ORDER BY tablename, indexname;
    `;

        console.log('\n✅ GIST Spatial Indexes:');
        indexes.forEach(idx => {
            console.log(`   - ${idx.tablename}.${idx.indexname}`);
        });

        // Test basic spatial query (ST_MakePoint)
        const testPoint = await prisma.$queryRaw<Array<{ lat: number; lon: number }>>`
      SELECT 
        ST_Y(ST_MakePoint(-122.4194, 37.7749)::geometry) as lat,
        ST_X(ST_MakePoint(-122.4194, 37.7749)::geometry) as lon;
    `;
        console.log('\n✅ ST_MakePoint test:', testPoint[0]);

        // Test distance calculation
        const distance = await prisma.$queryRaw<Array<{ distance_km: number }>>`
      SELECT ST_Distance(
        ST_MakePoint(-122.4194, 37.7749)::geography,
        ST_MakePoint(-122.4083, 37.7833)::geography
      ) / 1000 as distance_km;
    `;
        console.log('✅ ST_Distance test (SF downtown to Ferry Building):',
            `${distance[0].distance_km.toFixed(2)} km`);

        console.log('\n✨ All PostGIS functionality verified successfully!');
    } catch (error) {
        console.error('❌ PostGIS verification failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
