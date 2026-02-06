#!/usr/bin/env bun
/**
 * Database Seed Script for MVP Phase 1 Testing
 * 
 * Creates test data including:
 * - Test users with different roles
 * - Test devices with various location data (GPS, IP, postal codes)
 * - Saved zones for devices
 * - Sample alerts in different statuses
 * - Sample sightings
 * 
 * Run with: bun run scripts/seed-mvp-phase1.ts
 */

import { PrismaClient, AlertStatus, PetSpecies, DevicePlatform } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding MVP Phase 1 test data...\n');

    // Clean up existing MVP data (but keep users/roles/gates)
    console.log('🧹 Cleaning up existing MVP data...');
    await prisma.notification.deleteMany();
    await prisma.sighting.deleteMany();
    await prisma.savedZone.deleteMany();
    await prisma.alert.deleteMany();
    await prisma.device.deleteMany();
    console.log('✅ Cleanup complete\n');

    // Get or create test users
    console.log('👤 Creating test users...');

    const user1 = await prisma.user.upsert({
        where: { email: 'alice@example.com' },
        update: {},
        create: {
            email: 'alice@example.com',
            firstName: 'Alice',
            lastName: 'Johnson',
            name: 'Alice Johnson',
            emailVerified: true,
        },
    });

    const user2 = await prisma.user.upsert({
        where: { email: 'bob@example.com' },
        update: {},
        create: {
            email: 'bob@example.com',
            firstName: 'Bob',
            lastName: 'Smith',
            name: 'Bob Smith',
            emailVerified: true,
        },
    });

    const user3 = await prisma.user.upsert({
        where: { email: 'charlie@example.com' },
        update: {},
        create: {
            email: 'charlie@example.com',
            firstName: 'Charlie',
            lastName: 'Brown',
            name: 'Charlie Brown',
            emailVerified: true,
        },
    });

    console.log(`✅ Created users: ${user1.name}, ${user2.name}, ${user3.name}\n`);

    // Create devices with various location data
    console.log('📱 Creating test devices...');

    // Alice's iOS device - San Francisco (GPS + Postal Code)
    const aliceDevice = await prisma.$executeRaw`
    INSERT INTO device (
      user_id, device_uuid, platform, os_version, app_version,
      push_token, push_enabled,
      gps_lat, gps_lon, gps_point, gps_accuracy_meters, gps_updated_at,
      postal_codes, last_app_open, created_at, updated_at
    ) VALUES (
      ${user1.id}, 
      'alice-ios-device-001', 
      'IOS', 
      '17.2', 
      '1.0.0',
      'alice-fcm-token-123',
      true,
      37.7749, 
      -122.4194, 
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
      10.0,
      NOW(),
      ARRAY['94102', '94103']::TEXT[],
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING id;
  `;

    // Bob's Android device - Oakland (GPS + IP)
    const bobDevice = await prisma.$executeRaw`
    INSERT INTO device (
      user_id, device_uuid, platform, os_version, app_version,
      push_token, push_enabled,
      gps_lat, gps_lon, gps_point, gps_accuracy_meters, gps_updated_at,
      ip_address, ip_lat, ip_lon, ip_point, ip_city, ip_country, ip_updated_at,
      postal_codes, last_app_open, created_at, updated_at
    ) VALUES (
      ${user2.id}, 
      'bob-android-device-001', 
      'ANDROID', 
      '14', 
      '1.0.0',
      'bob-fcm-token-456',
      true,
      37.8044, 
      -122.2711, 
      ST_SetSRID(ST_MakePoint(-122.2711, 37.8044), 4326),
      15.0,
      NOW() - INTERVAL '2 hours',
      '192.168.1.100',
      37.8044,
      -122.2711,
      ST_SetSRID(ST_MakePoint(-122.2711, 37.8044), 4326),
      'Oakland',
      'US',
      NOW(),
      ARRAY['94612', '94607']::TEXT[],
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING id;
  `;

    // Charlie's iOS device - Berkeley (Postal Code only)
    const charlieDevice = await prisma.$executeRaw`
    INSERT INTO device (
      user_id, device_uuid, platform, os_version, app_version,
      push_token, push_enabled,
      postal_codes, last_app_open, created_at, updated_at
    ) VALUES (
      ${user3.id}, 
      'charlie-ios-device-001', 
      'IOS', 
      '17.1', 
      '1.0.0',
      'charlie-apns-token-789',
      true,
      ARRAY['94704', '94720']::TEXT[],
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING id;
  `;

    console.log('✅ Created 3 test devices with various location data\n');

    // Get device IDs
    const devices = await prisma.device.findMany({
        where: {
            user_id: { in: [user1.id, user2.id, user3.id] },
        },
        select: { id: true, user_id: true },
    });

    const aliceDeviceId = devices.find(d => d.user_id === user1.id)!.id;
    const bobDeviceId = devices.find(d => d.user_id === user2.id)!.id;

    await prisma.$executeRaw`
    INSERT INTO saved_zone (
      device_id, name, lat, lon, location_point, radius_km, is_active, priority,
      created_at, updated_at
    ) VALUES 
    (
      ${aliceDeviceId},
      'Home',
      37.7749,
      -122.4194,
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
      3.0,
      true,
      10,
      NOW(),
      NOW()
    ),
    (
      ${aliceDeviceId},
      'Work',
      37.7833,
      -122.4167,
      ST_SetSRID(ST_MakePoint(-122.4167, 37.7833), 4326),
      2.0,
      true,
      5,
      NOW(),
      NOW()
    ),
    (
      ${bobDeviceId},
      'Home',
      37.8044,
      -122.2711,
      ST_SetSRID(ST_MakePoint(-122.2711, 37.8044), 4326),
      5.0,
      true,
      10,
      NOW(),
      NOW()
    );
  `;

    console.log('✅ Created saved zones for Alice and Bob\n');

    // Create sample alerts
    console.log('🐕 Creating sample alerts...');

    // Active alert - Missing Golden Retriever in SF
    await prisma.$executeRaw`
    INSERT INTO alert (
      creator_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years,
      pet_photos, last_seen_lat, last_seen_lon, location_point, location_address,
      alert_radius_km, status, time_last_seen, created_at, updated_at, expires_at,
      contact_phone, contact_email, is_phone_public, reward_offered, reward_amount, notes
    ) VALUES (
      ${user1.id},
      'Max',
      'DOG',
      'Golden Retriever',
      'Friendly golden retriever, 3 years old. Wearing a blue collar with tags. Very friendly with people but scared of loud noises.',
      'Golden',
      3,
      ARRAY['https://example.com/photos/max1.jpg', 'https://example.com/photos/max2.jpg']::TEXT[],
      37.7749,
      -122.4194,
      ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
      '123 Market St, San Francisco, CA 94102',
      5.0,
      'ACTIVE',
      NOW() - INTERVAL '3 hours',
      NOW() - INTERVAL '3 hours',
      NOW(),
      NOW() + INTERVAL '7 days',
      '+1-415-555-0101',
      'alice@example.com',
      true,
      true,
      500.00,
      'Max ran away during a walk when startled by fireworks. Please call if you see him!'
    );
  `;

    // Active alert - Missing cat in Oakland
    await prisma.$executeRaw`
    INSERT INTO alert (
      creator_id, pet_name, pet_species, pet_breed, pet_description, pet_color, pet_age_years,
      last_seen_lat, last_seen_lon, location_point, location_address,
      alert_radius_km, status, time_last_seen, created_at, updated_at, expires_at,
      contact_phone, contact_email, is_phone_public, reward_offered, notes
    ) VALUES (
      ${user2.id},
      'Luna',
      'CAT',
      'Siamese',
      'Indoor cat that accidentally got out. Very shy and may be hiding. Blue eyes, cream and brown coloring.',
      'Cream/Brown',
      2,
      37.8044,
      -122.2711,
      ST_SetSRID(ST_MakePoint(-122.2711, 37.8044), 4326),
      '456 Broadway, Oakland, CA 94612',
      3.0,
      'ACTIVE',
      NOW() - INTERVAL '12 hours',
      NOW() - INTERVAL '12 hours',
      NOW(),
      NOW() + INTERVAL '7 days',
      '+1-510-555-0202',
      'bob@example.com',
      false,
      true,
      'Luna is microchipped. Please check under porches and bushes nearby.'
    );
  `;

    // Draft alert - not yet published
    await prisma.$executeRaw`
    INSERT INTO alert (
      creator_id, pet_name, pet_species, pet_breed, pet_description,
      last_seen_lat, last_seen_lon, location_point,
      alert_radius_km, status, time_last_seen, created_at, updated_at, expires_at
    ) VALUES (
      ${user3.id},
      'Tweety',
      'BIRD',
      'Parakeet',
      'Small green parakeet with yellow head.',
      37.8716,
      -122.2727,
      ST_SetSRID(ST_MakePoint(-122.2727, 37.8716), 4326),
      2.0,
      'DRAFT',
      NOW() - INTERVAL '1 hour',
      NOW() - INTERVAL '1 hour',
      NOW(),
      NOW() + INTERVAL '7 days'
    );
  `;

    // Resolved alert - pet found
    await prisma.$executeRaw`
    INSERT INTO alert (
      creator_id, pet_name, pet_species, pet_description,
      last_seen_lat, last_seen_lon, location_point,
      alert_radius_km, status, time_last_seen, created_at, updated_at, expires_at, resolved_at,
      notes
    ) VALUES (
      ${user1.id},
      'Buddy',
      'DOG',
      'Small terrier mix, brown and white.',
      37.7699,
      -122.4469,
      ST_SetSRID(ST_MakePoint(-122.4469, 37.7699), 4326),
      5.0,
      'RESOLVED',
      NOW() - INTERVAL '5 days',
      NOW() - INTERVAL '5 days',
      NOW(),
      NOW() + INTERVAL '2 days',
      NOW() - INTERVAL '1 day',
      'Found safe! Thank you to everyone who helped look for Buddy.'
    );
  `;

    console.log('✅ Created 4 sample alerts (ACTIVE, DRAFT, RESOLVED)\n');

    // Get alert IDs for sightings
    const alerts = await prisma.alert.findMany({
        where: {
            status: AlertStatus.ACTIVE,
        },
        select: { id: true, pet_name: true },
    });

    if (alerts.length >= 2) {
        const maxAlert = alerts.find(a => a.pet_name === 'Max')!;
        const lunaAlert = alerts.find(a => a.pet_name === 'Luna')!;
      INSERT INTO sighting(
            alert_id, reporter_id, sighting_lat, sighting_lon, location_point,
            location_address, notes, confidence, sighting_time, direction,
            created_at, updated_at
        ) VALUES
            (
                ${ maxAlert.id },
                ${ user2.id },
                37.7765,
                -122.4180,
                ST_SetSRID(ST_MakePoint(-122.4180, 37.7765), 4326),
                'Near Union Square',
                'Saw a golden retriever matching the description running down Market Street.',
                'LIKELY',
                NOW() - INTERVAL '1 hour',
                'EAST',
                NOW() - INTERVAL '1 hour',
                NOW()
            ),
            (
                ${ maxAlert.id },
        ${ user3.id },
        37.7800,
            -122.4200,
            ST_SetSRID(ST_MakePoint(-122.4200, 37.7800), 4326),
            'Chinatown area',
            'Pretty sure I saw Max near a park. He was with some kids who were petting him.',
            'CERTAIN',
            NOW() - INTERVAL '30 minutes',
                'STATIONARY',
                NOW() - INTERVAL '30 minutes',
                    NOW()
      );
        `;

        console.log('✅ Created 2 sightings for Max\n');
    }

    console.log('✨ Database seeding complete!\n');
    console.log('📊 Summary:');
    console.log('   - Users: 3');
    console.log('   - Devices: 3 (with GPS, IP, and postal code data)');
    console.log('   - Saved Zones: 3');
    console.log('   - Alerts: 4 (ACTIVE: 2, DRAFT: 1, RESOLVED: 1)');
    console.log('   - Sightings: 2');
    console.log('\n✅ You can now test the MVP Phase 1 functionality!');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
