// Seed — dev data. Idempotent (safe to re-run).
// Creates: a Super Admin, the default per-post ServiceFeeConfig, categories,
// platform settings, two sample traders, and a handful of listings across
// them (mixed HAVE/WANT, categories, conditions) for browse/watchlist/trade
// testing.

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

// Starter legal/marketing pages, seeded PUBLISHED so the footer + sitemap have
// real content on first boot. These are plain-language templates — have counsel
// review before production. Body uses the CMS Markdown subset (## / - / ** / []()).
const CONTENT_PAGES: { slug: string; title: string; description: string; body: string }[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    description: 'The terms that govern your use of Garage Sale.',
    body: `# Terms of Service

By creating an account or using Garage Sale, you agree to these terms.

## 1. What Garage Sale is

Garage Sale is a local, peer-to-peer marketplace for **swapping items**. We provide the platform; trades happen directly between users. We are not a party to any trade and do not take possession of items.

## 2. Eligibility

You must be at least 18 years old and able to form a binding contract to use Garage Sale.

## 3. Per-post fee

Publishing a listing requires a valid payment method and incurs a **flat per-post fee**, shown at checkout before you publish.

- Proposing trades, messaging, and completing swaps are free.
- The post fee is **non-refundable** once a listing goes live.
- Editing a live listing is free; relisting a removed or traded item is a new post and is charged again.

## 4. Acceptable use

You agree not to list prohibited or illegal items, misrepresent items, harass other users, or attempt to circumvent platform fees. We may remove listings and suspend or ban accounts that violate these terms.

## 5. Trades and trust

After one party confirms a completed trade, the other has a limited window to confirm. Failing to confirm in time may result in your account being flagged as untrusted. Ratings and trust status reflect trade history only.

## 6. Disclaimers

Garage Sale is provided "as is." We do not guarantee the quality, safety, or legality of items, or that any trade will be completed.

## 7. Changes

We may update these terms. Continued use after changes take effect constitutes acceptance.

For questions, see our [Privacy Policy](/privacy) or contact support.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    description: 'How Garage Sale collects, uses, and protects your data.',
    body: `# Privacy Policy

This policy explains what we collect and how we use it.

## Information we collect

- **Account data:** email, display name, and (if you sign in with Google, Apple, or Facebook) basic profile details.
- **Location:** the city and neighbourhood you provide, used to show nearby listings.
- **Payment data:** handled by our payment processor, Stripe. We store a payment-method reference, never full card numbers.
- **Usage data:** listings, trades, messages, and ratings you create on the platform.

## How we use it

We use your data to operate the marketplace: matching listings, enabling trades and messaging, charging the per-post fee, and maintaining trust and safety.

## Sharing

We share data with service providers (such as Stripe for payments and our email provider) only as needed to run Garage Sale. We do not sell your personal data.

## Your choices

You can edit your profile, manage blocked users, and request account deletion. Some records may be retained where required for legal or fraud-prevention purposes.

## Cookies

We use essential cookies to keep you signed in. See our [Cookie Policy](/cookies) for details.

## Contact

For privacy questions, contact support through the app.`,
  },
  {
    slug: 'cookies',
    title: 'Cookie Policy',
    description: 'How Garage Sale uses cookies.',
    body: `# Cookie Policy

Garage Sale uses a small number of cookies to function.

## Essential cookies

- **Session cookies** keep you signed in (\`gs_session\`, \`gs_refresh\`). These are required to use your account.

## Analytics

We may use privacy-respecting analytics to understand aggregate usage. These do not identify you individually.

## Managing cookies

You can clear or block cookies in your browser settings, but blocking essential cookies will prevent you from signing in.

See our [Privacy Policy](/privacy) for how we handle your data.`,
  },
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
  const bob = await prisma.user.upsert({
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

  // Sample ACTIVE listings for Alice and Bob (mix of HAVE/WANT, categories,
  // conditions) so browse/watchlist/propose-trade flows have real data to
  // exercise against.
  const SAMPLE_LISTINGS: {
    id: string;
    ownerId: string;
    type: 'HAVE' | 'WANT';
    title: string;
    description: string;
    condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'POOR';
    categoryId: string;
    city: string;
    neighbourhood: string;
    wantedDescription?: string;
    wantedCategoryId?: string;
  }[] = [
    {
      id: 'seed-listing-1',
      ownerId: alice.id,
      type: 'HAVE',
      title: 'Vintage road bike',
      description: 'Steel frame, recently tuned. Looking to swap for camping gear.',
      condition: 'GOOD',
      categoryId: 'seed-cat-6', // Sports & Outdoors
      city: 'Austin',
      neighbourhood: 'Downtown',
      wantedDescription: 'Tent, sleeping bag, or a camp stove.',
      wantedCategoryId: 'seed-cat-6',
    },
    {
      id: 'seed-listing-2',
      ownerId: alice.id,
      type: 'HAVE',
      title: 'Mid-century record player',
      description: 'Works great, needs a new needle. Comes with a small vinyl collection.',
      condition: 'FAIR',
      categoryId: 'seed-cat-0', // Electronics
      city: 'Austin',
      neighbourhood: 'Downtown',
    },
    {
      id: 'seed-listing-3',
      ownerId: alice.id,
      type: 'WANT',
      title: 'Looking for: kids bicycle',
      description: 'Any condition, roughly ages 6-8. For a birthday.',
      condition: 'GOOD',
      categoryId: 'seed-cat-5', // Toys & Games
      city: 'Austin',
      neighbourhood: 'Downtown',
    },
    {
      id: 'seed-listing-4',
      ownerId: bob.id,
      type: 'HAVE',
      title: 'Solid oak dining table',
      description: 'Seats 6. A couple of scratches on the top but very sturdy.',
      condition: 'GOOD',
      categoryId: 'seed-cat-1', // Furniture
      city: 'Austin',
      neighbourhood: 'East Side',
      wantedDescription: 'Power tools or a good mountain bike.',
      wantedCategoryId: 'seed-cat-7',
    },
    {
      id: 'seed-listing-5',
      ownerId: bob.id,
      type: 'HAVE',
      title: 'Cordless drill + bit set',
      description: 'Barely used, includes charger and two batteries.',
      condition: 'LIKE_NEW',
      categoryId: 'seed-cat-7', // Tools
      city: 'Austin',
      neighbourhood: 'East Side',
    },
    {
      id: 'seed-listing-6',
      ownerId: bob.id,
      type: 'HAVE',
      title: 'Box of assorted paperbacks',
      description: 'Mostly sci-fi and mystery, ~20 books.',
      condition: 'GOOD',
      categoryId: 'seed-cat-3', // Books & Media
      city: 'Austin',
      neighbourhood: 'East Side',
    },
  ];

  for (const listing of SAMPLE_LISTINGS) {
    const { id, ...data } = listing;
    await prisma.listing.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ...data,
        status: 'ACTIVE',
        publishedAt: new Date(),
      },
    });
  }

  // CMS content pages (legal/marketing), seeded PUBLISHED.
  await Promise.all(
    CONTENT_PAGES.map((page) =>
      prisma.contentPage.upsert({
        where: { slug: page.slug },
        update: { title: page.title, description: page.description, body: page.body },
        create: {
          ...page,
          status: 'PUBLISHED',
          updatedByAdminId: admin.id,
        },
      }),
    ),
  );

  console.log('Seed complete: admin, fee config, categories, settings, content, sample data.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
