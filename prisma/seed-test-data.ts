import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed test data for roles and gates
 * Run with: bun run prisma db seed
 */
async function main() {
    console.log('🌱 Seeding test data...');

    // Create Roles
    console.log('Creating roles...');
    const adminRole = await prisma.role.upsert({
        where: { slug: 'admin' },
        update: {},
        create: {
            name: 'Administrator',
            slug: 'admin',
            level: 1, // Highest privilege
            active: true,
        },
    });

    const managerRole = await prisma.role.upsert({
        where: { slug: 'manager' },
        update: {},
        create: {
            name: 'Manager',
            slug: 'manager',
            level: 2,
            active: true,
        },
    });

    const userRole = await prisma.role.upsert({
        where: { slug: 'user' },
        update: {},
        create: {
            name: 'User',
            slug: 'user',
            level: 3, // Lowest privilege
            active: true,
        },
    });

    console.log(`✓ Created roles: ${adminRole.name}, ${managerRole.name}, ${userRole.name}`);

    // Create Gates (Feature Flags)
    console.log('Creating gates...');
    const premiumGate = await prisma.gate.upsert({
        where: { slug: 'premium-features' },
        update: {},
        create: {
            name: 'Premium Features',
            slug: 'premium-features',
            active: true,
        },
    });

    const betaGate = await prisma.gate.upsert({
        where: { slug: 'beta-features' },
        update: {},
        create: {
            name: 'Beta Features',
            slug: 'beta-features',
            active: true,
        },
    });

    const analyticsGate = await prisma.gate.upsert({
        where: { slug: 'advanced-analytics' },
        update: {},
        create: {
            name: 'Advanced Analytics',
            slug: 'advanced-analytics',
            active: true,
        },
    });

    const exportGate = await prisma.gate.upsert({
        where: { slug: 'data-export' },
        update: {},
        create: {
            name: 'Data Export',
            slug: 'data-export',
            active: true,
        },
    });

    console.log(`✓ Created gates: ${premiumGate.name}, ${betaGate.name}, ${analyticsGate.name}, ${exportGate.name}`);

    // Find test user and assign role + gates
    const testUser = await prisma.user.findFirst({
        where: {
            email: {
                contains: 'testuser',
            },
        },
    });

    if (testUser) {
        console.log(`Found test user: ${testUser.email}`);

        // Assign user role
        await prisma.userRole.upsert({
            where: {
                user_id_role_id: {
                    user_id: testUser.id,
                    role_id: userRole.id,
                },
            },
            update: {},
            create: {
                user_id: testUser.id,
                role_id: userRole.id,
            },
        });
        console.log(`✓ Assigned ${userRole.name} role to ${testUser.email}`);

        // Assign premium and beta gates
        await prisma.userGate.upsert({
            where: {
                user_id_gate_id: {
                    user_id: testUser.id,
                    gate_id: premiumGate.id,
                },
            },
            update: {},
            create: {
                user_id: testUser.id,
                gate_id: premiumGate.id,
            },
        });

        await prisma.userGate.upsert({
            where: {
                user_id_gate_id: {
                    user_id: testUser.id,
                    gate_id: betaGate.id,
                },
            },
            update: {},
            create: {
                user_id: testUser.id,
                gate_id: betaGate.id,
            },
        });

        console.log(`✓ Assigned ${premiumGate.name} and ${betaGate.name} gates to ${testUser.email}`);
    } else {
        console.log('⚠ No test user found. Create a user via signup first.');
    }

    console.log('✅ Seeding complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
