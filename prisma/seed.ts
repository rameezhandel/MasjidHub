/**
 * Idempotent seed: bootstraps the single platform admin from environment
 * variables. Safe to run repeatedly (e.g. as part of a deploy pipeline).
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME ?? 'Platform';
  const lastName = process.env.PLATFORM_ADMIN_LAST_NAME ?? 'Admin';

  if (!email || !password) {
    throw new Error('PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD must be set to seed');
  }
  if (password.length < 12) {
    throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters');
  }

  const existing = await prisma.user.findFirst({ where: { role: UserRole.PLATFORM_ADMIN } });
  if (existing) {
    console.log(`Platform admin already exists (${existing.email}); nothing to do.`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: UserRole.PLATFORM_ADMIN,
      isActive: true,
    },
  });
  console.log(`Created platform admin ${admin.email} (${admin.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
