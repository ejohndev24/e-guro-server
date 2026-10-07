/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password) throw new Error('ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required');
  if (password.length < 14) throw new Error('ADMIN_PASSWORD must contain at least 14 characters');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== UserRole.SUPER_ADMIN) throw new Error('That email belongs to a non-admin account');
  const admin = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash: await argon2.hash(password), role: UserRole.SUPER_ADMIN, mustChangePassword: false },
    create: { name, email, passwordHash: await argon2.hash(password), role: UserRole.SUPER_ADMIN, mustChangePassword: false },
  });
  console.log(`Super administrator ready: ${admin.email}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
