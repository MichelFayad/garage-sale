// Seed — dev data. Idempotent (safe to re-run).
// Creates: a Super Admin, the default per-post ServiceFeeConfig, categories,
// platform settings, and a couple of sample traders with listings.

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_CONFIRMATION_WINDOW_DAYS, DEFAULT_POST_FEE_CENTS } from '@garage-sale/core';

const prisma = new PrismaClient();

const CATEGORIES = [
  'Electronics',
  'Furniture',
  'Clothing',
  'Books & Media',
  'Home & Garden',
  'Toys & Games',
  'Sports & Outdoors',
  'Tools',
  'Other',
];

async function main() {
  // Super Admin (email/password only).
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@garagesale.example' },
    update: {},
    create: {
      email: 'admin@garagesale.example',
      passwordHash: await bcrypt.hash('changeme-dev', 10),
      displayName: 'Super Admin',
      role: 'SUPER',
    },
  });

  // Default per-post fee (append-only history; current = latest effectiveFrom).
  const feeExists = await prisma.serviceFeeConfig.findFirst();
  if (!feeExists) {
    await prisma.serviceFeeConfig.create({
      data: { amountCents: DEFAULT_POST_FEE_CENTS, changedByAdminId: admin.id },
    });
  }

  // Platform settings.
  await prisma.platformSetting.upsert({
    where: { key: 'confirmationWindowDays' },
    update: {},
    create: { key: 'confirmationWindowDays', value: DEFAULT_CONFIRMATION_WINDOW_DAYS },
  });

  // Categories.
  await Promise.all(
    CATEGORIES.map((name, i) =>
      prisma.category.upsert({
        // name isn't unique in the schema; key dev seed by deterministic id.
        where: { id: `seed-cat-${i}` },
        update: { name, sortOrder: i },
        create: { id: `seed-cat-${i}`, name, sortOrder: i },
      }),
    ),
  );

  // Sample traders.
  const passwordHash = await bcrypt.hash('password123', 10);
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      passwordHash,
      displayName: 'Alice',
      emailVerifiedAt: new Date(),
      city: 'Austin',
      neighbourhood: 'Downtown',
      paymentValid: true,
    },
  });
  await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      passwordHash,
      displayName: 'Bob',
      emailVerifiedAt: new Date(),
      city: 'Austin',
      neighbourhood: 'East Side',
      paymentValid: true,
    },
  });

  // A sample ACTIVE listing for Alice.
  const listingExists = await prisma.listing.findFirst({ where: { ownerId: alice.id } });
  if (!listingExists) {
    await prisma.listing.create({
      data: {
        ownerId: alice.id,
        type: 'HAVE',
        title: 'Vintage road bike',
        description: 'Steel frame, recently tuned. Looking to swap for camping gear.',
        condition: 'GOOD',
        categoryId: 'seed-cat-6', // Sports & Outdoors
        city: 'Austin',
        neighbourhood: 'Downtown',
        status: 'ACTIVE',
        publishedAt: new Date(),
        wantedDescription: 'Tent, sleeping bag, or a camp stove.',
        wantedCategoryId: 'seed-cat-6',
      },
    });
  }

  console.log('Seed complete: admin, fee config, categories, settings, sample data.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
