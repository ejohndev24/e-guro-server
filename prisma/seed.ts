/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { AttendanceStatus, PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const studentSeedData = [
  ['2024001', 'Maria Sofia', 'Cruz'],
  ['2024002', 'John', 'Dela Cruz'],
  ['2024003', 'Ana', 'Garcia'],
  ['2024004', 'Mark', 'Reyes'],
  ['2024005', 'Liza', 'Santos'],
  ['2024006', 'Miguel', 'Torres'],
  ['2024007', 'Patricia', 'Lim'],
  ['2024008', 'James', 'Aquino'],
  ['2024009', 'Carlo', 'Mendoza'],
  ['2024010', 'Bianca', 'Ramos'],
] as const;

const scoreSets = [
  [90, 85, 88], [78, 80, 75], [95, 90, 92], [60, 65, 70], [88, 85, 90],
  [55, 60, 58], [70, 68, 66], [72, 70, 69], [84, 81, 86], [92, 89, 94],
];

function utcDate(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function main() {
  await prisma.grade.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
  await prisma.school.deleteMany();

  const school = await prisma.school.create({
    data: { name: 'Riverside Learning Academy', code: 'RLA' },
  });
  await prisma.user.create({
    data: {
      name: 'System Administrator',
      email: 'admin@teacherhub.local',
      passwordHash: await argon2.hash('Admin123!'),
      mustChangePassword: false,
      role: UserRole.SUPER_ADMIN,
    },
  });
  const teacher = await prisma.user.create({
    data: {
      name: 'Alex Rivera',
      email: 'alex.rivera@school.edu',
      passwordHash: await argon2.hash('Teacher123!'),
      mustChangePassword: true,
      role: UserRole.TEACHER,
      schoolId: school.id,
    },
  });
  await prisma.user.create({
    data: {
      name: 'Riverside School Administrator',
      email: 'school.admin@school.edu',
      passwordHash: await argon2.hash('SchoolAdmin123!'),
      mustChangePassword: false,
      role: UserRole.SCHOOL_ADMIN,
      schoolId: school.id,
    },
  });

  const students = await Promise.all(studentSeedData.map(([studentNo, firstName, lastName]) => prisma.student.create({
    data: {
      studentNo,
      schoolId: school.id,
      qrCode: `STUDENT:${studentNo}`,
      firstName,
      lastName,
      email: `${firstName.toLowerCase().replaceAll(' ', '.')}.${lastName.toLowerCase().replaceAll(' ', '.')}@student.edu`,
    },
  })));

  const classData = [
    { gradeLevel: 6, section: 'Section A', subject: 'Mathematics', room: 'Room 101', scheduleDay: 'Monday', startTime: '08:00', endTime: '09:00' },
    { gradeLevel: 6, section: 'Section A', subject: 'Science', room: 'Room 101', scheduleDay: 'Monday', startTime: '09:30', endTime: '10:30' },
    { gradeLevel: 5, section: 'Section B', subject: 'English', room: 'Room 102', scheduleDay: 'Monday', startTime: '11:00', endTime: '12:00' },
    { gradeLevel: 5, section: 'Section B', subject: 'Araling Panlipunan', room: 'Room 102', scheduleDay: 'Monday', startTime: '13:00', endTime: '14:00' },
  ];

  const classrooms = await Promise.all(classData.map((data) => prisma.classroom.create({
    data: { ...data, teacherId: teacher.id, schoolId: school.id },
  })));

  for (const classroom of classrooms) {
    await prisma.enrollment.createMany({
      data: students.map((student) => ({ studentId: student.id, classroomId: classroom.id })),
    });
  }

  for (const [classIndex, classroom] of classrooms.entries()) {
    await prisma.grade.createMany({
      data: students.map((student, index) => {
        const base = scoreSets[(index + classIndex) % scoreSets.length];
        const [quiz, activity, exam] = base;
        return {
          studentId: student.id,
          classroomId: classroom.id,
          quarter: 1,
          quiz,
          activity,
          exam,
          finalGrade: Math.round((quiz * 0.2 + activity * 0.3 + exam * 0.5) * 10) / 10,
        };
      }),
    });

    for (let day = 0; day < 5; day += 1) {
      await prisma.attendance.createMany({
        data: students.map((student, index) => {
          const isAbsent = (index + day + classIndex) % 9 === 0;
          const status: AttendanceStatus = isAbsent ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT;
          const date = utcDate(day);
          return {
            studentId: student.id,
            classroomId: classroom.id,
            date,
            status,
            checkedAt: isAbsent ? null : new Date(date.getTime() + (8 * 60 + index) * 60 * 1000),
          };
        }),
      });
    }
  }

  console.log(`Seeded ${classrooms.length} classes and ${students.length} students.`);
  console.log(`Sample QR value: STUDENT:${students[0].studentNo}`);
  console.log('Admin login: admin@teacherhub.local / Admin123!');
  console.log('School admin login: school.admin@school.edu / SchoolAdmin123!');
  console.log('Teacher login: alex.rivera@school.edu / Teacher123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
