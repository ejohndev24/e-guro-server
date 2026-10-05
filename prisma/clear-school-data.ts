import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (!process.argv.includes('--confirm')) {
    throw new Error('Refusing to clear school data without --confirm');
  }
  const superAdmins = await prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } });
  if (superAdmins < 1) {
    throw new Error('Reset refused: no SUPER_ADMIN account would remain');
  }
  const deleted = await prisma.$transaction(async (tx) => {
    const schools = await tx.school.deleteMany();
    const unscopedUsers = await tx.user.deleteMany({ where: { role: { not: UserRole.SUPER_ADMIN } } });
    return { schools: schools.count, unscopedNonSuperUsers: unscopedUsers.count };
  });
  const [schools, users, students, classes, attendance, grades, schemes] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.student.count(),
    prisma.classroom.count(),
    prisma.attendance.count(),
    prisma.grade.count(),
    prisma.gradingScheme.count(),
  ]);
  console.log(JSON.stringify({ deleted, remaining: { schools, users, students, classes, attendance, grades, schemes } }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
