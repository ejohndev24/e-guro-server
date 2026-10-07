/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceScope, AttendanceStatus, EducationLevel, Prisma, SchoolReportKind, SchoolReportStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AddStudentToClassInput, ConfigureClassGradingInput, CreateAssessmentInput, CreateStudentGroupInput, SaveAssessmentScoresInput, SaveGradebookScoresInput, SaveGradesInput, SetGroupAdviserInput, TeacherClassInput, TeacherStudentInput } from './school.types';
import { SaveObservedValueInput, UpdateSchoolProfileInput } from './school.report-types';
import { computeStudentGrade, GradeCategoryResult, transmuteDepEdGrade, usesDepEdTransmutation } from './grading';

const studentShape = (student: { id: string; studentNo: string; firstName: string; lastName: string; email: string | null; lrn?: string | null; birthDate?: Date | null; sex?: 'MALE' | 'FEMALE' | null }) => ({
  ...student,
  email: student.email ?? undefined,
  lrn: student.lrn ?? undefined,
  birthDate: student.birthDate ?? undefined,
  sex: student.sex ?? undefined,
  fullName: `${student.lastName}, ${student.firstName}`,
});

const classroomShape = (room: {
  id: string; gradeLevel: number; section: string; subject: string; room: string;
  scheduleDay: string; startTime: string; endTime: string; schoolYear: string; term: string;
  educationLevel: EducationLevel; isAdvisory: boolean;
  _count?: { enrollments: number };
}) => ({
  ...room,
  studentCount: room._count?.enrollments ?? 0,
  displayName: `${room.gradeLevel === 0 ? 'Kindergarten' : `Grade/Year ${room.gradeLevel}`} - ${room.section} • ${room.subject}`,
});

const dayStart = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const supportsDepEdDailyAttendance = (level: EducationLevel) => ([
  EducationLevel.KINDERGARTEN,
  EducationLevel.ELEMENTARY,
  EducationLevel.JUNIOR_HIGH,
  EducationLevel.SENIOR_HIGH,
] as EducationLevel[]).includes(level);

@Injectable()
export class SchoolService {
  constructor(private readonly prisma: PrismaService) {}

  private async teacher(id: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id } });
    if (!teacher || teacher.role !== UserRole.TEACHER) throw new NotFoundException('Teacher account not found');
    return teacher;
  }

  async classes(teacherId: string) {
    const teacher = await this.teacher(teacherId);
    const classes = await this.prisma.classroom.findMany({
      where: { teacherId: teacher.id },
      include: { _count: { select: { enrollments: true } } },
      orderBy: [{ startTime: 'asc' }],
    });
    return classes.map(classroomShape);
  }

  async createClass(input: TeacherClassInput, teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher || teacher.role !== UserRole.TEACHER) throw new NotFoundException('Teacher account not found');
    if (!teacher.school) throw new NotFoundException('Teacher school not found');
    if (input.startTime >= input.endTime) throw new BadRequestException('End time must be later than start time');
    const group = input.groupId ? await this.prisma.classGroup.findFirst({ where: { id: input.groupId, teacherId, schoolId: teacher.school.id }, include: { memberships: true, classrooms: { select: { id: true } } } }) : null;
    if (input.groupId && !group) throw new NotFoundException('Group not found');
    const gradeLevel = group?.gradeLevel ?? input.gradeLevel;
    const section = group?.section ?? input.section.trim();
    const schoolYear = group?.schoolYear ?? input.schoolYear.trim();
    const term = group?.term ?? input.term.trim();
    const educationLevel = group?.educationLevel ?? input.educationLevel;
    const isAdvisory = group ? group.isAdvisory && group.classrooms.length === 0 : input.isAdvisory;
    let scheme = await this.prisma.gradingScheme.findFirst({ where: { schoolId: teacher.school.id, status: 'ACTIVE', educationLevel }, orderBy: { createdAt: 'asc' } });
    if (!scheme) {
      scheme = await this.prisma.gradingScheme.create({
        data: {
          name: `${educationLevel.replaceAll('_', ' ')} custom grading`,
          educationLevel,
          status: 'ACTIVE',
          schoolId: teacher.school.id,
          categories: { create: [{ name: 'Coursework', weight: 100, position: 0 }] },
        },
      });
    }
    if (!supportsDepEdDailyAttendance(educationLevel) && isAdvisory) throw new BadRequestException('Official daily attendance is available only for DepEd basic-education groups');
    if (isAdvisory) {
      await this.prisma.classroom.updateMany({
        where: {
          schoolId: teacher.school.id,
          gradeLevel,
          section: { equals: section, mode: 'insensitive' },
          schoolYear,
          term,
        },
        data: { isAdvisory: false },
      });
    }
    const classroom = await this.prisma.$transaction(async (tx) => {
      const created = await tx.classroom.create({ data: { subject: input.subject.trim(), gradeLevel, section, room: input.room.trim(), scheduleDay: input.scheduleDay.trim(), startTime: input.startTime, endTime: input.endTime, schoolYear, term, teacherId: teacher.id, schoolId: teacher.school!.id, gradingSchemeId: scheme?.id, educationLevel, isAdvisory, groupId: group?.id } });
      if (group?.memberships.length) await tx.enrollment.createMany({ data: group.memberships.map((membership) => ({ classroomId: created.id, studentId: membership.studentId })), skipDuplicates: true });
      return tx.classroom.findUniqueOrThrow({ where: { id: created.id }, include: { _count: { select: { enrollments: true } } } });
    });
    return classroomShape(classroom);
  }

  async deleteClass(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId }, select: { id: true } });
    if (!classroom) throw new NotFoundException('Class not found');
    await this.prisma.classroom.delete({ where: { id: classroom.id } });
    return true;
  }

  async createStudentGroup(input: CreateStudentGroupInput, teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher || teacher.role !== UserRole.TEACHER) throw new NotFoundException('Teacher account not found');
    if (!teacher.school) throw new NotFoundException('Teacher school not found');
    if (!supportsDepEdDailyAttendance(input.educationLevel) && input.isAdvisory) throw new BadRequestException('Only basic-education groups can be advisory groups');
    const duplicate = await this.prisma.classGroup.findFirst({ where: { teacherId, gradeLevel: input.gradeLevel, section: { equals: input.section.trim(), mode: 'insensitive' }, schoolYear: input.schoolYear.trim(), term: input.term.trim() } });
    if (duplicate) throw new BadRequestException('This group already exists for the selected school year and term');
    const group = await this.prisma.classGroup.create({ data: { ...input, section: input.section.trim(), schoolYear: input.schoolYear.trim(), term: input.term.trim(), teacherId, schoolId: teacher.school.id }, include: { classrooms: { include: { _count: { select: { enrollments: true } } } }, memberships: { include: { student: true } } } });
    return this.studentGroupShape(group);
  }

  async deleteStudentGroup(groupId: string, teacherId: string) {
    const group = await this.prisma.classGroup.findFirst({
      where: { id: groupId, teacherId },
      include: { classrooms: { select: { id: true } }, memberships: { select: { studentId: true } } },
    });
    if (!group) throw new NotFoundException('Section not found');

    const classroomIds = group.classrooms.map((classroom) => classroom.id);
    const studentIds = [...new Set(group.memberships.map((membership) => membership.studentId))];
    await this.prisma.$transaction(async (tx) => {
      if (classroomIds.length) await tx.classroom.deleteMany({ where: { id: { in: classroomIds }, teacherId } });
      await tx.classGroup.delete({ where: { id: group.id } });
      if (studentIds.length) {
        await tx.student.deleteMany({
          where: { id: { in: studentIds }, schoolId: group.schoolId, groupMemberships: { none: {} }, enrollments: { none: {} } },
        });
      }
    });
    return true;
  }

  async removeStudentFromGroup(groupId: string, studentId: string, teacherId: string) {
    const group = await this.prisma.classGroup.findFirst({
      where: { id: groupId, teacherId, memberships: { some: { studentId } } },
      include: { classrooms: { select: { id: true } } },
    });
    if (!group) throw new NotFoundException('Student is not in this section');

    const classroomIds = group.classrooms.map((classroom) => classroom.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.groupMembership.deleteMany({ where: { groupId, studentId } });
      if (classroomIds.length) await tx.enrollment.deleteMany({ where: { studentId, classroomId: { in: classroomIds } } });
      const remaining = await tx.student.findUnique({ where: { id: studentId }, select: { groupMemberships: { select: { id: true }, take: 1 }, enrollments: { select: { id: true }, take: 1 } } });
      if (remaining && !remaining.groupMemberships.length && !remaining.enrollments.length) await tx.student.delete({ where: { id: studentId } });
    });
    return true;
  }

  async setGroupAdviser(input: SetGroupAdviserInput, teacherId: string) {
    const teacher = await this.personalTeacher(teacherId);
    const group = await this.prisma.classGroup.findFirst({ where: { id: input.groupId, teacherId, schoolId: teacher.school!.id }, include: { classrooms: { orderBy: { createdAt: 'asc' }, include: { _count: { select: { enrollments: true } } } }, memberships: { include: { student: true }, orderBy: { student: { lastName: 'asc' } } } } });
    if (!group) throw new NotFoundException('Group not found');
    if (input.isAdvisory && !supportsDepEdDailyAttendance(group.educationLevel)) throw new BadRequestException('Only basic-education groups can have an adviser attendance record');
    await this.prisma.$transaction(async (tx) => {
      await tx.classGroup.update({ where: { id: group.id }, data: { isAdvisory: input.isAdvisory } });
      await tx.classroom.updateMany({ where: { groupId: group.id }, data: { isAdvisory: false } });
      if (input.isAdvisory && group.classrooms[0]) await tx.classroom.update({ where: { id: group.classrooms[0].id }, data: { isAdvisory: true } });
    });
    return this.studentGroupShape({ ...group, isAdvisory: input.isAdvisory, classrooms: group.classrooms.map((classroom, index) => ({ ...classroom, isAdvisory: input.isAdvisory && index === 0 })) });
  }

  async addStudentToClass(input: AddStudentToClassInput, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: input.classroomId, teacherId }, include: { school: true, group: { include: { classrooms: { select: { id: true } } } } },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    const studentNo = input.studentNo.trim();
    const student = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.student.findUnique({ where: { schoolId_studentNo: { schoolId: classroom.schoolId, studentNo } } });
      const saved = existing ?? await tx.student.create({ data: { studentNo, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email?.trim().toLowerCase() || null, schoolId: classroom.schoolId, qrCode: `STUDENT:${classroom.schoolId}:${studentNo}:${randomBytes(8).toString('hex')}` } });
      const classroomIds = classroom.group?.classrooms.map((item) => item.id) ?? [classroom.id];
      await tx.enrollment.createMany({ data: classroomIds.map((classroomId) => ({ studentId: saved.id, classroomId })), skipDuplicates: true });
      if (classroom.groupId) await tx.groupMembership.createMany({ data: [{ groupId: classroom.groupId, studentId: saved.id }], skipDuplicates: true });
      return saved;
    });
    return studentShape(student);
  }

  async saveTeacherStudent(input: TeacherStudentInput, teacherId: string) {
    const teacher = await this.personalTeacher(teacherId);
    await this.assertTeacherClasses(input.classroomIds, teacher.id, teacher.school!.id);
    await this.assertTeacherGroups(input.groupIds, teacher.id, teacher.school!.id);
    await this.writeTeacherStudents([input], teacher.school!.id);
    const student = await this.prisma.student.findUnique({
      where: { schoolId_studentNo: { schoolId: teacher.school!.id, studentNo: input.studentNo.trim() } },
    });
    if (!student) throw new NotFoundException('Saved student could not be loaded');
    return studentShape(student);
  }

  async importTeacherStudents(inputs: TeacherStudentInput[], teacherId: string) {
    if (!inputs.length) throw new BadRequestException('The CSV file does not contain any students');
    if (inputs.length > 1000) throw new BadRequestException('Import up to 1,000 students at a time');
    const teacher = await this.personalTeacher(teacherId);
    const studentNumbers = inputs.map((input) => input.studentNo.trim().toLowerCase());
    if (new Set(studentNumbers).size !== studentNumbers.length) throw new BadRequestException('Student numbers must be unique in the CSV file');
    const classroomIds = [...new Set(inputs.flatMap((input) => input.classroomIds))];
    const groupIds = [...new Set(inputs.flatMap((input) => input.groupIds))];
    await this.assertTeacherClasses(classroomIds, teacher.id, teacher.school!.id);
    await this.assertTeacherGroups(groupIds, teacher.id, teacher.school!.id);
    await this.writeTeacherStudents(inputs, teacher.school!.id);
    return { count: inputs.length };
  }

  private async personalTeacher(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher || teacher.role !== UserRole.TEACHER) throw new NotFoundException('Teacher account not found');
    return teacher;
  }

  private async assertTeacherClasses(classroomIds: string[], teacherId: string, schoolId: string) {
    if (!classroomIds.length) return;
    const count = await this.prisma.classroom.count({ where: { id: { in: classroomIds }, teacherId, schoolId } });
    if (count !== classroomIds.length) throw new BadRequestException('One or more selected classes are unavailable');
  }

  private async assertTeacherGroups(groupIds: string[], teacherId: string, schoolId: string) {
    if (!groupIds.length) return;
    const count = await this.prisma.classGroup.count({ where: { id: { in: groupIds }, teacherId, schoolId } });
    if (count !== groupIds.length) throw new BadRequestException('One or more selected groups are unavailable');
  }

  private async writeTeacherStudents(inputs: TeacherStudentInput[], schoolId: string) {
    await this.prisma.$transaction(async (tx) => {
      for (const input of inputs) {
        const studentNo = input.studentNo.trim();
        const existing = await tx.student.findUnique({
          where: { schoolId_studentNo: { schoolId, studentNo } },
          include: { enrollments: { select: { classroomId: true } } },
        });
        if (existing) {
          const locked = await tx.schoolReport.findFirst({
            where: {
              schoolId,
              status: SchoolReportStatus.LOCKED,
              OR: [
                { studentId: existing.id },
                { classroomId: { in: existing.enrollments.map((item) => item.classroomId) } },
              ],
            },
          });
          if (locked) throw new BadRequestException(`${locked.kind} is locked. This learner's report details can no longer be changed.`);
        }
        const student = await tx.student.upsert({
          where: { schoolId_studentNo: { schoolId, studentNo } },
          update: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email?.trim().toLowerCase() || null, lrn: input.lrn?.trim() || null, birthDate: input.birthDate ? dayStart(new Date(input.birthDate)) : null, sex: input.sex ?? null },
          create: {
            studentNo, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email?.trim().toLowerCase() || null,
            lrn: input.lrn?.trim() || null, birthDate: input.birthDate ? dayStart(new Date(input.birthDate)) : null, sex: input.sex ?? null,
            schoolId, qrCode: `STUDENT:${schoolId}:${studentNo}:${randomBytes(8).toString('hex')}`,
          },
        });
        if (input.classroomIds.length) {
          await tx.enrollment.createMany({ data: input.classroomIds.map((classroomId) => ({ studentId: student.id, classroomId })), skipDuplicates: true });
        }
        const classGroups = input.classroomIds.length
          ? await tx.classGroup.findMany({ where: { classrooms: { some: { id: { in: input.classroomIds } } } }, select: { id: true } })
          : [];
        const groupIds = [...new Set([...input.groupIds, ...classGroups.map((group) => group.id)])];
        if (groupIds.length) {
          const groups = await tx.classGroup.findMany({ where: { id: { in: groupIds } }, include: { classrooms: { select: { id: true } } } });
          await tx.groupMembership.createMany({ data: groups.map((group) => ({ groupId: group.id, studentId: student.id })), skipDuplicates: true });
          const groupedClassrooms = groups.flatMap((group) => group.classrooms.map((classroom) => classroom.id));
          if (groupedClassrooms.length) await tx.enrollment.createMany({ data: groupedClassrooms.map((classroomId) => ({ classroomId, studentId: student.id })), skipDuplicates: true });
        }
      }
    });
  }

  async dashboard(teacherId: string, quarter = 1) {
    if (quarter < 1 || quarter > 4) throw new BadRequestException('Quarter must be from 1 to 4');
    const teacher = await this.teacher(teacherId);
    const classes = await this.prisma.classroom.findMany({
      where: { teacherId: teacher.id },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { startTime: 'asc' },
    });
    const classIds = classes.map((item) => item.id);
    const studentCount = await this.prisma.student.count({
      where: { enrollments: { some: { classroomId: { in: classIds } } } },
    });
    const [attendanceTotal, attendancePresent, grades, enrollmentCount] = await Promise.all([
      this.prisma.attendance.count({ where: { classroomId: { in: classIds }, scope: AttendanceScope.SUBJECT } }),
      this.prisma.attendance.count({ where: { classroomId: { in: classIds }, scope: AttendanceScope.SUBJECT, status: { in: ['PRESENT', 'LATE'] } } }),
      this.prisma.grade.findMany({
        where: { classroomId: { in: classIds }, quarter },
        include: { student: true, classroom: { include: { _count: { select: { enrollments: true } } } } },
        orderBy: { finalGrade: 'asc' },
      }),
      this.prisma.enrollment.count({ where: { classroomId: { in: classIds } } }),
    ]);
    const gradedKeys = new Set(grades.map((grade) => `${grade.classroomId}:${grade.studentId}`));
    const gradeValues = grades.map((grade) => grade.finalGrade);
    const gradeReports = classes.map((classroom) => {
      const classGrades = grades.filter((grade) => grade.classroomId === classroom.id);
      return {
        classroom: classroomShape(classroom),
        averageGrade: classGrades.length
          ? Math.round((classGrades.reduce((sum, grade) => sum + grade.finalGrade, 0) / classGrades.length) * 10) / 10
          : undefined,
        gradedStudents: classGrades.length,
        studentCount: classroom._count.enrollments,
        passingStudents: classGrades.filter((grade) => grade.finalGrade >= 75).length,
      };
    });

    return {
      teacherName: teacher.name,
      stats: {
        classCount: classes.length,
        studentCount,
        attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 1000) / 10 : 0,
        pendingGrades: Math.max(0, enrollmentCount - gradedKeys.size),
        averageGrade: gradeValues.length
          ? Math.round((gradeValues.reduce((sum, grade) => sum + grade, 0) / gradeValues.length) * 10) / 10
          : undefined,
      },
      classes: classes.map(classroomShape),
      atRisk: grades.filter((grade) => grade.finalGrade < 75).slice(0, 5).map((grade) => ({
        student: studentShape(grade.student),
        classroom: classroomShape(grade.classroom),
        currentGrade: grade.finalGrade,
      })),
      gradeReports,
    };
  }

  async classDetail(id: string, date: string | undefined, quarter: number, teacherId: string, attendanceScope: AttendanceScope = AttendanceScope.SUBJECT) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id, teacherId },
      include: {
        _count: { select: { enrollments: true } },
        enrollments: {
          include: {
            student: {
              include: {
                attendances: { where: { classroomId: id, date: dayStart(date ? new Date(date) : new Date()), scope: attendanceScope }, take: 1 },
                grades: { where: { classroomId: id, quarter }, take: 1 },
              },
            },
          },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    if (attendanceScope === AttendanceScope.DAILY && (!classroom.isAdvisory || !supportsDepEdDailyAttendance(classroom.educationLevel))) {
      throw new BadRequestException('Official daily attendance is available only to the assigned basic-education class adviser');
    }
    return {
      classroom: classroomShape(classroom),
      roster: classroom.enrollments.map(({ student }) => ({
        student: studentShape(student),
        attendance: student.attendances[0],
        grade: student.grades[0],
      })),
    };
  }

  async students(teacherId: string, search?: string) {
    const teacher = await this.teacher(teacherId);
    const school = teacher.schoolId ? await this.prisma.school.findUnique({ where: { id: teacher.schoolId }, select: { isPersonal: true } }) : null;
    const where: Prisma.StudentWhereInput = {
      ...(school?.isPersonal ? { schoolId: teacher.schoolId! } : { enrollments: { some: { classroom: { teacherId } } } }),
      ...(search?.trim() ? { OR: [
        { firstName: { contains: search.trim(), mode: 'insensitive' } },
        { lastName: { contains: search.trim(), mode: 'insensitive' } },
        { studentNo: { contains: search.trim(), mode: 'insensitive' } },
      ] } : {}),
    };
    const students = await this.prisma.student.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    return students.map(studentShape);
  }

  async studentGroups(teacherId: string) {
    await this.teacher(teacherId);
    const groups = await this.prisma.classGroup.findMany({
      where: { teacherId },
      include: {
        classrooms: { include: { _count: { select: { enrollments: true } } }, orderBy: { subject: 'asc' } },
        memberships: { include: { student: true }, orderBy: { student: { lastName: 'asc' } } },
      },
      orderBy: [{ gradeLevel: 'asc' }, { section: 'asc' }],
    });
    return groups.map((group) => this.studentGroupShape(group));
  }

  private studentGroupShape(group: any) {
    return {
      id: group.id,
      gradeLevel: group.gradeLevel,
      section: group.section,
      schoolYear: group.schoolYear,
      term: group.term,
      educationLevel: group.educationLevel,
      isAdvisory: group.isAdvisory,
      displayName: `${group.gradeLevel === 0 ? 'Kindergarten' : `Grade/Year ${group.gradeLevel}`} - ${group.section}`,
      studentCount: group.memberships.length,
      classes: group.classrooms.map(classroomShape),
      students: group.memberships.map((membership: any) => studentShape(membership.student)),
    };
  }

  async studentProfile(id: string, teacherId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id, enrollments: { some: { classroom: { teacherId } } } },
      include: {
        grades: { orderBy: [{ quarter: 'desc' }, { createdAt: 'desc' }] },
        attendances: { where: { scope: AttendanceScope.SUBJECT }, orderBy: { date: 'desc' }, take: 12 },
        enrollments: { include: { classroom: { include: { _count: { select: { enrollments: true } } } } } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');
    const present = student.attendances.filter((item) => ['PRESENT', 'LATE'].includes(item.status)).length;
    const overallGrade = student.grades.length
      ? student.grades.reduce((sum, grade) => sum + grade.finalGrade, 0) / student.grades.length
      : 0;
    const classes = await Promise.all(student.enrollments.map(async ({ classroom }) => {
      const [attendances, grades] = await Promise.all([
        this.prisma.attendance.findMany({ where: { studentId: id, classroomId: classroom.id, scope: AttendanceScope.SUBJECT } }),
        this.prisma.grade.findMany({ where: { studentId: id, classroomId: classroom.id } }),
      ]);
      const attended = attendances.filter((item) => ['PRESENT', 'LATE'].includes(item.status)).length;
      return {
        classroom: classroomShape(classroom),
        attendanceRate: attendances.length ? Math.round((attended / attendances.length) * 1000) / 10 : 0,
        averageGrade: grades.length ? Math.round((grades.reduce((sum, item) => sum + item.finalGrade, 0) / grades.length) * 10) / 10 : undefined,
      };
    }));
    return {
      student: studentShape(student),
      classes,
      recentAttendance: student.attendances,
      grades: student.grades,
      overallGrade: Math.round(overallGrade * 10) / 10,
      attendanceRate: student.attendances.length ? Math.round((present / student.attendances.length) * 1000) / 10 : 0,
    };
  }

  async setAttendance(classroomId: string, studentId: string, date: string, status: AttendanceStatus, teacherId: string, scope: AttendanceScope = AttendanceScope.SUBJECT, reason?: string) {
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId } });
    if (!classroom) throw new NotFoundException('Classroom not found');
    if (scope === AttendanceScope.DAILY && (!classroom.isAdvisory || !supportsDepEdDailyAttendance(classroom.educationLevel))) {
      throw new BadRequestException('Official daily attendance is available only to the assigned basic-education class adviser');
    }
    const enrolled = await this.prisma.enrollment.count({ where: { classroomId, studentId } });
    if (!enrolled) throw new BadRequestException('The learner is not enrolled in this class');
    const cleanReason = status === AttendanceStatus.EXCUSED ? reason?.trim() : undefined;
    if (status === AttendanceStatus.EXCUSED && !cleanReason) throw new BadRequestException('Enter a reason for an excused absence');
    const checkedAt = status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE ? new Date() : null;
    const attendanceDate = dayStart(new Date(date));
    if (scope === AttendanceScope.DAILY) {
      const month = attendanceDate.toISOString().slice(0, 7);
      const locked = await this.prisma.schoolReport.findFirst({ where: { status: SchoolReportStatus.LOCKED, reportKey: { in: [this.reportKey(SchoolReportKind.SF2, classroomId, month), this.reportKey(SchoolReportKind.SF9, classroomId, classroom.schoolYear, studentId)] } } });
      if (locked) throw new BadRequestException(`${locked.kind} is locked. Attendance can no longer be changed for this report.`);
    }
    return this.prisma.attendance.upsert({
      where: { studentId_classroomId_date_scope: { studentId, classroomId, date: attendanceDate, scope } },
      update: { status, reason: cleanReason ?? null, checkedAt },
      create: { studentId, classroomId, date: attendanceDate, status, reason: cleanReason, scope, checkedAt },
    });
  }

  async saveGrades(input: SaveGradesInput, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: input.classroomId, teacherId },
      include: { gradingScheme: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    await this.assertGradeReportsUnlocked(input.classroomId, input.entries.map((entry) => entry.studentId));
    const gradeRows = input.entries.map((entry) => ({
      ...entry,
      finalGrade: (() => {
        const initial = Math.round((entry.quiz * 0.2 + entry.activity * 0.3 + entry.exam * 0.5) * 100) / 100;
        return usesDepEdTransmutation(classroom.gradingScheme?.educationLevel) ? transmuteDepEdGrade(initial) : initial;
      })(),
    }));
    const grades = await this.prisma.$transaction(gradeRows.map((entry) => this.prisma.grade.upsert({
      where: { studentId_classroomId_quarter: { studentId: entry.studentId, classroomId: input.classroomId, quarter: input.quarter } },
      update: { quiz: entry.quiz, activity: entry.activity, exam: entry.exam, finalGrade: entry.finalGrade },
      create: { ...entry, classroomId: input.classroomId, quarter: input.quarter },
    })));
    return { count: grades.length, grades };
  }

  async gradebook(classroomId: string, quarter: number, teacherId: string) {
    await this.assertOwnsClass(classroomId, teacherId);
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        _count: { select: { enrollments: true } },
        enrollments: { include: { student: true }, orderBy: { student: { lastName: 'asc' } } },
        gradingScheme: {
          include: {
            categories: {
              orderBy: { position: 'asc' },
              include: { assessments: { where: { classroomId, quarter }, orderBy: { createdAt: 'asc' }, include: { scores: true } } },
            },
          },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    const categories = (classroom.gradingScheme?.categories ?? []).map((category) => ({
      ...category,
      weight: Number(category.weight),
      assessments: category.assessments.map((assessment) => ({
        ...assessment,
        maxScore: Number(assessment.maxScore),
        scores: assessment.scores.map((score) => ({ studentId: score.studentId, score: score.score === null ? undefined : Number(score.score) })),
      })),
    }));
    const students = classroom.enrollments.map(({ student }) => {
      const computation = computeStudentGrade(student.id, categories, classroom.gradingScheme?.educationLevel);
      return {
        student: studentShape(student),
        initialGrade: computation?.initialGrade,
        finalGrade: computation?.finalGrade,
        components: computation?.components,
      };
    });
    return { classroom: classroomShape(classroom), schemeName: classroom.gradingScheme?.name, categories, students };
  }

  async createAssessment(input: CreateAssessmentInput, teacherId: string) {
    await this.assertOwnsClass(input.classroomId, teacherId);
    await this.assertGradeReportsUnlocked(input.classroomId);
    const category = await this.prisma.gradeCategory.findFirst({
      where: { id: input.categoryId, scheme: { classrooms: { some: { id: input.classroomId } } } },
    });
    if (!category) throw new BadRequestException('This category is not part of the class grading template');
    const assessment = await this.prisma.assessment.create({
      data: { classroomId: input.classroomId, categoryId: input.categoryId, title: input.title.trim(), maxScore: input.maxScore, quarter: input.quarter },
    });
    // A newly added item makes the quarter incomplete until its scores are encoded.
    await this.prisma.grade.deleteMany({ where: { classroomId: input.classroomId, quarter: input.quarter } });
    return assessment;
  }

  async saveAssessmentScores(input: SaveAssessmentScoresInput, teacherId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: input.assessmentId, classroom: { teacherId } },
      include: { classroom: { include: { enrollments: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    await this.assertGradeReportsUnlocked(assessment.classroomId, input.scores.map((item) => item.studentId));
    const enrolled = new Set(assessment.classroom.enrollments.map((item) => item.studentId));
    if (input.scores.some((item) => !enrolled.has(item.studentId))) throw new BadRequestException('A student is not enrolled in this class');
    if (input.scores.some((item) => item.score !== undefined && item.score > Number(assessment.maxScore))) {
      throw new BadRequestException(`Scores cannot exceed ${Number(assessment.maxScore)}`);
    }
    await this.prisma.$transaction(input.scores.map((item) => item.score === undefined
      ? this.prisma.studentScore.deleteMany({ where: { assessmentId: assessment.id, studentId: item.studentId } })
      : this.prisma.studentScore.upsert({
        where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: item.studentId } },
        update: { score: item.score },
        create: { assessmentId: assessment.id, studentId: item.studentId, score: item.score },
      })));
    const gradebook = await this.gradebook(assessment.classroomId, assessment.quarter, teacherId);
    const grades = await this.syncComputedGrades(assessment.classroomId, assessment.quarter, gradebook.students);
    return { count: input.scores.length, grades };
  }

  async saveGradebookScores(input: SaveGradebookScoresInput, teacherId: string) {
    await this.assertOwnsClass(input.classroomId, teacherId);
    await this.assertGradeReportsUnlocked(input.classroomId, input.assessments.flatMap((item) => item.scores.map((score) => score.studentId)));
    if (!input.assessments.length) throw new BadRequestException('No changed assessments were provided');
    const assessmentIds = input.assessments.map((item) => item.assessmentId);
    if (new Set(assessmentIds).size !== assessmentIds.length) throw new BadRequestException('Each assessment can only be saved once');

    const [assessments, enrollments] = await Promise.all([
      this.prisma.assessment.findMany({
        where: { id: { in: assessmentIds }, classroomId: input.classroomId, quarter: input.quarter },
      }),
      this.prisma.enrollment.findMany({ where: { classroomId: input.classroomId }, select: { studentId: true } }),
    ]);
    if (assessments.length !== assessmentIds.length) throw new BadRequestException('One or more assessments are unavailable for this class and quarter');

    const assessmentById = new Map(assessments.map((assessment) => [assessment.id, assessment]));
    const enrolled = new Set(enrollments.map((item) => item.studentId));
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    for (const item of input.assessments) {
      const assessment = assessmentById.get(item.assessmentId)!;
      if (item.scores.some((score) => !enrolled.has(score.studentId))) throw new BadRequestException('A student is not enrolled in this class');
      if (item.scores.some((score) => score.score !== undefined && score.score > Number(assessment.maxScore))) {
        throw new BadRequestException(`${assessment.title} scores cannot exceed ${Number(assessment.maxScore)}`);
      }
      for (const score of item.scores) {
        operations.push(score.score === undefined
          ? this.prisma.studentScore.deleteMany({ where: { assessmentId: assessment.id, studentId: score.studentId } })
          : this.prisma.studentScore.upsert({
            where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: score.studentId } },
            update: { score: score.score },
            create: { assessmentId: assessment.id, studentId: score.studentId, score: score.score },
          }));
      }
    }
    await this.prisma.$transaction(operations);
    const gradebook = await this.gradebook(input.classroomId, input.quarter, teacherId);
    const grades = await this.syncComputedGrades(input.classroomId, input.quarter, gradebook.students);
    return { count: operations.length, grades };
  }

  async configureClassGrading(input: ConfigureClassGradingInput, teacherId: string) {
    if (!input.categories.length) throw new BadRequestException('Add at least one grading category');
    const total = Math.round(input.categories.reduce((sum, category) => sum + category.weight, 0) * 100) / 100;
    if (total !== 100) throw new BadRequestException(`Category weights must equal 100%. Current total is ${total}%`);
    const names = input.categories.map((category) => category.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Category names must be unique');

    const classroom = await this.prisma.classroom.findFirst({
      where: { id: input.classroomId, teacherId },
      include: {
        school: true,
        gradingScheme: {
          include: { categories: { include: { assessments: { where: { classroomId: input.classroomId }, select: { id: true } } } } },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    if (!classroom.school.isPersonal) throw new BadRequestException('School-managed grading templates are edited by the school administrator');
    if (!classroom.gradingScheme) throw new BadRequestException('This class does not have a grading template');
    await this.assertGradeReportsUnlocked(classroom.id);

    const existingById = new Map(classroom.gradingScheme.categories.map((category) => [category.id, category]));
    for (const category of input.categories) {
      if (category.id && !existingById.has(category.id)) throw new BadRequestException('One or more grading categories are unavailable');
    }
    const retainedIds = new Set(input.categories.flatMap((category) => category.id ? [category.id] : []));
    const removedWithAssessments = classroom.gradingScheme.categories.find((category) => !retainedIds.has(category.id) && category.assessments.length);
    if (removedWithAssessments) throw new BadRequestException(`Move or remove assessments from ${removedWithAssessments.name} before deleting that category`);

    const templateName = `${classroom.subject} - ${classroom.section}`;
    const previous = await this.prisma.gradingScheme.findFirst({
      where: { schoolId: classroom.schoolId, name: templateName },
      orderBy: { version: 'desc' },
    });

    await this.prisma.$transaction(async (tx) => {
      const scheme = await tx.gradingScheme.create({
        data: {
          name: templateName,
          educationLevel: classroom.gradingScheme!.educationLevel,
          status: 'ACTIVE',
          version: (previous?.version ?? 0) + 1,
          schoolId: classroom.schoolId,
        },
      });
      for (const [position, category] of input.categories.entries()) {
        const created = await tx.gradeCategory.create({
          data: { schemeId: scheme.id, name: category.name.trim(), weight: category.weight, position },
        });
        if (category.id) {
          await tx.assessment.updateMany({
            where: { classroomId: classroom.id, categoryId: category.id },
            data: { categoryId: created.id },
          });
        }
      }
      await tx.classroom.update({ where: { id: classroom.id }, data: { gradingSchemeId: scheme.id } });
    });
    for (const quarter of [1, 2, 3, 4]) {
      const gradebook = await this.gradebook(classroom.id, quarter, teacherId);
      await this.syncComputedGrades(classroom.id, quarter, gradebook.students);
    }
  }

  private reportKey(kind: SchoolReportKind, classroomId: string, periodKey: string, studentId?: string) {
    return [kind, classroomId, periodKey, studentId ?? 'CLASS'].join(':');
  }

  private async advisoryClass(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: classroomId, teacherId },
      include: {
        teacher: true,
        school: true,
        _count: { select: { enrollments: true } },
        enrollments: { include: { student: true }, orderBy: { student: { lastName: 'asc' } } },
      },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    if (!classroom.isAdvisory || !supportsDepEdDailyAttendance(classroom.educationLevel)) throw new BadRequestException('Select a DepEd basic-education advisory class');
    return classroom;
  }

  private reportSchool(school: { name: string; schoolIdNumber: string | null; region: string | null; division: string | null; district: string | null; address: string | null; schoolHeadName: string | null }) {
    return { ...school, schoolIdNumber: school.schoolIdNumber ?? undefined, region: school.region ?? undefined, division: school.division ?? undefined, district: school.district ?? undefined, address: school.address ?? undefined, schoolHeadName: school.schoolHeadName ?? undefined };
  }

  private schoolMissing(school: { schoolIdNumber: string | null; region: string | null; division: string | null; district: string | null; address: string | null; schoolHeadName: string | null }) {
    return [
      ['School ID', school.schoolIdNumber], ['Region', school.region], ['Division', school.division],
      ['District', school.district], ['School address', school.address], ['School head', school.schoolHeadName],
    ].filter(([, value]) => !value).map(([label]) => label!);
  }

  private async currentReportStatus(kind: SchoolReportKind, classroomId: string, periodKey: string, studentId?: string) {
    return (await this.prisma.schoolReport.findUnique({ where: { reportKey: this.reportKey(kind, classroomId, periodKey, studentId) } }))?.status ?? SchoolReportStatus.DRAFT;
  }

  async sf2Report(classroomId: string, month: string, teacherId: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Month must use YYYY-MM');
    const classroom = await this.advisoryClass(classroomId, teacherId);
    const [year, monthNumber] = month.split('-').map(Number) as [number, number];
    const first = new Date(Date.UTC(year, monthNumber - 1, 1));
    const next = new Date(Date.UTC(year, monthNumber, 1));
    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const records = await this.prisma.attendance.findMany({ where: { classroomId, scope: AttendanceScope.DAILY, date: { gte: first, lt: next } } });
    const missingFields = this.schoolMissing(classroom.school);
    const rows = classroom.enrollments.map(({ student }) => {
      const byDay = new Map(records.filter((item) => item.studentId === student.id).map((item) => [item.date.getUTCDate(), item.status]));
      const days = Array.from({ length: daysInMonth }, (_, index) => byDay.get(index + 1) ?? '');
      return { student: studentShape(student), days, present: days.filter((value) => value === 'PRESENT').length, absent: days.filter((value) => value === 'ABSENT').length, late: days.filter((value) => value === 'LATE').length, excused: days.filter((value) => value === 'EXCUSED').length };
    });
    if (!rows.length) missingFields.push('Class roster');
    return { school: this.reportSchool(classroom.school), classroom: classroomShape(classroom), adviserName: classroom.teacher.name, month, status: await this.currentReportStatus(SchoolReportKind.SF2, classroomId, month), readyToFinalize: !missingFields.length, missingFields, rows };
  }

  async sf9Report(classroomId: string, studentId: string, teacherId: string) {
    const advisory = await this.advisoryClass(classroomId, teacherId);
    if (advisory.educationLevel === EducationLevel.KINDERGARTEN) {
      throw new BadRequestException('SF9 applies to Grades 1-12. Kindergarten uses the applicable Kindergarten progress report.');
    }
    const enrollment = advisory.enrollments.find((item) => item.studentId === studentId);
    if (!enrollment) throw new BadRequestException('The learner is not in this advisory section');
    const classes = await this.prisma.classroom.findMany({
      where: { schoolId: advisory.schoolId, gradeLevel: advisory.gradeLevel, section: { equals: advisory.section, mode: 'insensitive' }, schoolYear: advisory.schoolYear, term: advisory.term, enrollments: { some: { studentId } } },
      include: { grades: { where: { studentId }, orderBy: { quarter: 'asc' } } }, orderBy: { subject: 'asc' },
    });
    const daily = await this.prisma.attendance.findMany({ where: { classroomId, studentId, scope: AttendanceScope.DAILY }, orderBy: { date: 'asc' } });
    const observed = await this.prisma.observedValue.findMany({ where: { classroomId, studentId }, orderBy: [{ coreValue: 'asc' }, { quarter: 'asc' }] });
    const subjects = classes.map((room) => {
      const byQuarter = new Map(room.grades.map((grade) => [grade.quarter, grade.finalGrade]));
      const quarters = [1, 2, 3, 4].map((quarter) => byQuarter.get(quarter) ?? null);
      const complete = quarters.every((value) => value !== null);
      const finalRating = complete ? Math.round((quarters.reduce<number>((sum, value) => sum + (value ?? 0), 0) / 4) * 100) / 100 : undefined;
      return { subject: room.subject, quarters, finalRating, remarks: finalRating == null ? 'INCOMPLETE' : finalRating >= 75 ? 'PASSED' : 'FAILED' };
    });
    const attendanceMap = new Map<string, typeof daily>();
    for (const item of daily) { const key = item.date.toISOString().slice(0, 7); attendanceMap.set(key, [...(attendanceMap.get(key) ?? []), item]); }
    const attendance = [...attendanceMap.entries()].map(([month, items]) => ({ month, schoolDays: items.length, daysPresent: items.filter((item) => ['PRESENT', 'LATE'].includes(item.status)).length, daysAbsent: items.filter((item) => item.status === 'ABSENT').length, timesLate: items.filter((item) => item.status === 'LATE').length }));
    const coreValues = ['Maka-Diyos', 'Makatao', 'Makakalikasan', 'Makabansa'];
    const observedValues = coreValues.map((coreValue) => ({ coreValue, quarters: [1, 2, 3, 4].map((quarter) => observed.find((item) => item.coreValue === coreValue && item.quarter === quarter)?.rating ?? null) }));
    const student = enrollment.student;
    const missingFields = [...this.schoolMissing(advisory.school)];
    if (!student.lrn) missingFields.push('Learner LRN');
    if (!student.birthDate) missingFields.push('Learner birth date');
    if (!student.sex) missingFields.push('Learner sex');
    if (!subjects.length || subjects.some((subject) => subject.finalRating == null)) missingFields.push('Complete Q1-Q4 subject grades');
    if (observedValues.some((value) => value.quarters.some((rating) => rating == null))) missingFields.push('Q1-Q4 observed values');
    const variant = advisory.educationLevel === EducationLevel.ELEMENTARY ? 'SF9-ES' : advisory.educationLevel === EducationLevel.JUNIOR_HIGH ? 'SF9-JHS' : 'SF9-SHS';
    return { school: this.reportSchool(advisory.school), classroom: classroomShape(advisory), student: studentShape(student), adviserName: advisory.teacher.name, status: await this.currentReportStatus(SchoolReportKind.SF9, classroomId, advisory.schoolYear, studentId), variant, readyToFinalize: !missingFields.length, missingFields, subjects, attendance, observedValues };
  }

  async sf5Report(classroomId: string, teacherId: string) {
    const advisory = await this.advisoryClass(classroomId, teacherId);
    const classes = await this.prisma.classroom.findMany({ where: { schoolId: advisory.schoolId, gradeLevel: advisory.gradeLevel, section: { equals: advisory.section, mode: 'insensitive' }, schoolYear: advisory.schoolYear, term: advisory.term }, include: { grades: true } });
    const rows = advisory.enrollments.map(({ student }) => {
      const finals = classes.map((room) => { const grades = room.grades.filter((grade) => grade.studentId === student.id); return grades.length === 4 ? grades.reduce((sum, grade) => sum + grade.finalGrade, 0) / 4 : undefined; });
      const complete = finals.length > 0 && finals.every((value) => value !== undefined);
      const generalAverage = complete ? Math.round((finals.reduce<number>((sum, value) => sum + (value ?? 0), 0) / finals.length) * 100) / 100 : undefined;
      return { student: studentShape(student), generalAverage, result: !complete ? 'INCOMPLETE' : finals.every((value) => (value ?? 0) >= 75) ? 'PROMOTED' : 'FOR REVIEW/REMEDIATION' };
    });
    const missingFields = this.schoolMissing(advisory.school);
    if (!rows.length) missingFields.push('Class roster');
    if (rows.some((row) => row.generalAverage == null)) missingFields.push('Complete Q1-Q4 subject grades');
    const variant = advisory.educationLevel === EducationLevel.SENIOR_HIGH ? 'SF5A-SHS' : advisory.educationLevel === EducationLevel.KINDERGARTEN ? 'SF5-K' : 'SF5';
    return { school: this.reportSchool(advisory.school), classroom: classroomShape(advisory), adviserName: advisory.teacher.name, status: await this.currentReportStatus(SchoolReportKind.SF5, classroomId, advisory.schoolYear), variant, readyToFinalize: !missingFields.length, missingFields, rows };
  }

  async setReportStatus(kind: SchoolReportKind, classroomId: string, periodKey: string, status: SchoolReportStatus, teacherId: string, studentId?: string) {
    const classroom = await this.advisoryClass(classroomId, teacherId);
    const reportKey = this.reportKey(kind, classroomId, periodKey, studentId);
    const existing = await this.prisma.schoolReport.findUnique({ where: { reportKey } });
    if (existing?.status === SchoolReportStatus.LOCKED) throw new BadRequestException('A locked report cannot be changed');
    if (status === SchoolReportStatus.DRAFT && existing?.status === SchoolReportStatus.FINALIZED) throw new BadRequestException('Finalized reports cannot return to draft');
    if (status === SchoolReportStatus.LOCKED && existing?.status !== SchoolReportStatus.FINALIZED) throw new BadRequestException('Finalize the report before locking it');
    let ready = true;
    let missing: string[] = [];
    if (status !== SchoolReportStatus.DRAFT) {
      const report = kind === SchoolReportKind.SF2 ? await this.sf2Report(classroomId, periodKey, teacherId) : kind === SchoolReportKind.SF9 && studentId ? await this.sf9Report(classroomId, studentId, teacherId) : kind === SchoolReportKind.SF5 ? await this.sf5Report(classroomId, teacherId) : null;
      if (!report) throw new BadRequestException('Invalid report selection');
      ready = report.readyToFinalize; missing = report.missingFields;
    }
    if (!ready) throw new BadRequestException(`Complete these fields first: ${missing.join(', ')}`);
    return this.prisma.schoolReport.upsert({ where: { reportKey }, update: { status, finalizedAt: status === SchoolReportStatus.FINALIZED ? new Date() : existing?.finalizedAt, lockedAt: status === SchoolReportStatus.LOCKED ? new Date() : null }, create: { reportKey, kind, status, periodKey, classroomId, studentId, schoolId: classroom.schoolId, finalizedAt: status === SchoolReportStatus.FINALIZED ? new Date() : null, lockedAt: status === SchoolReportStatus.LOCKED ? new Date() : null } });
  }

  async mySchoolProfile(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher?.school) throw new NotFoundException('School profile not found');
    return this.reportSchool(teacher.school);
  }

  async updateMySchoolProfile(input: UpdateSchoolProfileInput, teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher?.school?.isPersonal) throw new BadRequestException('School-managed profile details are maintained by the school administrator');
    const locked = await this.prisma.schoolReport.findFirst({ where: { schoolId: teacher.school.id, status: SchoolReportStatus.LOCKED } });
    if (locked) throw new BadRequestException(`${locked.kind} is locked. School report details can no longer be changed.`);
    const clean = (value?: string) => value?.trim() || null;
    const school = await this.prisma.school.update({ where: { id: teacher.school.id }, data: { schoolIdNumber: clean(input.schoolIdNumber), region: clean(input.region), division: clean(input.division), district: clean(input.district), address: clean(input.address), schoolHeadName: clean(input.schoolHeadName) } });
    return this.reportSchool(school);
  }

  async saveObservedValue(input: SaveObservedValueInput, teacherId: string) {
    const classroom = await this.advisoryClass(input.classroomId, teacherId);
    if (!classroom.enrollments.some((item) => item.studentId === input.studentId)) throw new BadRequestException('The learner is not in this advisory section');
    const locked = await this.prisma.schoolReport.findUnique({ where: { reportKey: this.reportKey(SchoolReportKind.SF9, classroom.id, classroom.schoolYear, input.studentId) } });
    if (locked?.status === SchoolReportStatus.LOCKED) throw new BadRequestException('SF9 is locked. Observed values can no longer be changed.');
    const coreValue = input.coreValue.trim();
    if (!['Maka-Diyos', 'Makatao', 'Makakalikasan', 'Makabansa'].includes(coreValue)) throw new BadRequestException('Invalid DepEd core value');
    return this.prisma.observedValue.upsert({ where: { studentId_classroomId_quarter_coreValue: { studentId: input.studentId, classroomId: input.classroomId, quarter: input.quarter, coreValue } }, update: { rating: input.rating }, create: { ...input, coreValue } });
  }

  private componentScore(components: GradeCategoryResult[] | undefined, names: string[]) {
    const match = components?.find((component) => names.some((name) => component.name.toLowerCase().includes(name)));
    return match?.percentageScore ?? 0;
  }

  private async syncComputedGrades(
    classroomId: string,
    quarter: number,
    students: Array<{
      student: { id: string };
      finalGrade?: number;
      components?: GradeCategoryResult[];
    }>,
  ) {
    const complete = students.filter((entry) => entry.finalGrade !== undefined);
    const completeIds = complete.map((entry) => entry.student.id);
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.grade.deleteMany({
        where: {
          classroomId,
          quarter,
          ...(completeIds.length ? { studentId: { notIn: completeIds } } : {}),
        },
      }),
      ...complete.map((entry) => this.prisma.grade.upsert({
        where: { studentId_classroomId_quarter: { studentId: entry.student.id, classroomId, quarter } },
        update: {
          quiz: this.componentScore(entry.components, ['written', 'quiz']),
          activity: this.componentScore(entry.components, ['performance', 'activity']),
          exam: this.componentScore(entry.components, ['quarterly', 'exam']),
          finalGrade: entry.finalGrade!,
        },
        create: {
          studentId: entry.student.id,
          classroomId,
          quarter,
          quiz: this.componentScore(entry.components, ['written', 'quiz']),
          activity: this.componentScore(entry.components, ['performance', 'activity']),
          exam: this.componentScore(entry.components, ['quarterly', 'exam']),
          finalGrade: entry.finalGrade!,
        },
      })),
    ];
    await this.prisma.$transaction(operations);
    return this.prisma.grade.findMany({ where: { classroomId, quarter } });
  }

  private async assertOwnsClass(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId }, select: { id: true } });
    if (!classroom) throw new NotFoundException('Classroom not found');
  }

  private async assertGradeReportsUnlocked(classroomId: string, studentIds: string[] = []) {
    const classroom = await this.prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!classroom) throw new NotFoundException('Classroom not found');
    const advisory = await this.prisma.classroom.findFirst({ where: { schoolId: classroom.schoolId, gradeLevel: classroom.gradeLevel, section: { equals: classroom.section, mode: 'insensitive' }, schoolYear: classroom.schoolYear, term: classroom.term, isAdvisory: true } });
    if (!advisory) return;
    const report = await this.prisma.schoolReport.findFirst({ where: { classroomId: advisory.id, status: SchoolReportStatus.LOCKED, OR: [{ kind: SchoolReportKind.SF5, periodKey: classroom.schoolYear }, ...(studentIds.length ? [{ kind: SchoolReportKind.SF9, periodKey: classroom.schoolYear, studentId: { in: studentIds } }] : [{ kind: SchoolReportKind.SF9, periodKey: classroom.schoolYear }])] } });
    if (report) throw new BadRequestException(`${report.kind} is locked. Grades can no longer be changed for this report.`);
  }
}
