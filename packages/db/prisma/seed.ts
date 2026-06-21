// Seed — P0 bootstrap only. P1 expands this to seed categories, the default
// ServiceFeeConfig, a Super Admin, and sample users/listings for dev.

import { PrismaClient } from '@prisma/client';
import { DEFAULT_CONFIRMATION_WINDOW_DAYS } from '@garage-sale/core';

const prisma = new PrismaClient();

async function main() {
  await prisma.platformSetting.upsert({
    where: { key: 'confirmationWindowDays' },
    create: { key: 'confirmationWindowDays', value: DEFAULT_CONFIRMATION_WINDOW_DAYS },
    update: {},
  });
  console.log('Seed complete: platform settings.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
