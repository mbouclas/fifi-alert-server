// Simple seed script using raw SQL with Prisma
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding test data...');

    try {
        // Insert Roles
        console.log('Creating roles...');
        await prisma.$executeRaw`
      INSERT INTO "Role" (name, slug, level, active, created_at, updated_at)
      VALUES 
        ('Administrator', 'admin', 1, true, NOW(), NOW()),
        ('Manager', 'manager', 2, true, NOW(), NOW()),
        ('User', 'user', 3, true, NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING
    `;
        console.log('✓ Roles created');

        // Insert Gates
        console.log('Creating gates...');
        await prisma.$executeRaw`
      INSERT INTO "Gate" (name, slug, active, created_at, updated_at)
      VALUES 
        ('Premium Features', 'premium-features', true, NOW(), NOW()),
        ('Beta Features', 'beta-features', true, NOW(), NOW()),
        ('Advanced Analytics', 'advanced-analytics', true, NOW(), NOW()),
        ('Data Export', 'data-export', true, NOW(), NOW())
      ON CONFLICT (slug) DO NOTHING
    `;
        console.log('✓ Gates created');

        // Find test user
        const testUser = await prisma.$queryRaw<any[]>`
      SELECT id, email FROM "User" WHERE email LIKE '%testuser%' LIMIT 1
    `;

        if (testUser && testUser.length > 0) {
            const userId = testUser[0].id;
            console.log(`Found test user: ${testUser[0].email} (ID: ${userId})`);

            // Assign user role
            await prisma.$executeRaw`
        INSERT INTO "UserRole" (user_id, role_id, created_at)
        SELECT ${userId}, id, NOW() FROM "Role" WHERE slug = 'user'
        ON CONFLICT (user_id, role_id) DO NOTHING
      `;
            console.log('✓ Assigned User role');

            // Assign premium gate
            await prisma.$executeRaw`
        INSERT INTO "UserGate" (user_id, gate_id, created_at)
        SELECT ${userId}, id, NOW() FROM "Gate" WHERE slug = 'premium-features'
        ON CONFLICT (user_id, gate_id) DO NOTHING
      `;
            console.log('✓ Assigned Premium Features gate');

            // Assign beta gate
            await prisma.$executeRaw`
        INSERT INTO "UserGate" (user_id, gate_id, created_at)
        SELECT ${userId}, id, NOW() FROM "Gate" WHERE slug = 'beta-features'
        ON CONFLICT (user_id, gate_id) DO NOTHING
      `;
            console.log('✓ Assigned Beta Features gate');
        } else {
            console.log('⚠ No test user found. Create a user via signup first.');
        }

        console.log('✅ Seeding complete!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
