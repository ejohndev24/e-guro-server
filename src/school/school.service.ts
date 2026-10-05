import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AddStudentToClassInput, CreateAssessmentInput, SaveAssessmentScoresInput, SaveGradesInput, TeacherClassInput, TeacherStudentInput } from './school.types';

const studentShape = (student: { id: string; studentNo: string; firstName: string; lastName: string; email: string | null }) => ({
  ...student,
  email: student.email ?? undefined,
  fullName: `${student.lastName}, ${student.firstName}`,
});

const classroomShape = (room: {
  id: string; gradeLevel: number; section: string; subject: string; room: string;
  scheduleDay: string; startTime: string; endTime: string; schoolYear: string; term: string;
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
    if (!teacher.school?.isPersonal) throw new BadRequestException('School-managed classes are created by the school administrator');
    if (input.startTime >= input.endTime) throw new BadRequestException('End time must be later than start time');
    const scheme = await this.prisma.gradingScheme.findFirst({ where: { schoolId: teacher.school.id, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    const classroom = await this.prisma.classroom.create({
      data: {
        subject: input.subject.trim(), gradeLevel: input.gradeLevel, section: input.section.trim(), room: input.room.trim(),
        scheduleDay: input.scheduleDay.trim(), startTime: input.startTime, endTime: input.endTime,
        schoolYear: input.schoolYear.trim(), term: input.term.trim(), teacherId: teacher.id, schoolId: teacher.school.id,
        gradingSchemeId: scheme?.id,
      },
      include: { _count: { select: { enrollments: true } } },
    });
    return classroomShape(classroom);
  }

  async addStudentToClass(input: AddStudentToClassInput, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: input.classroomId, teacherId }, include: { school: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
    if (!classroom.school.isPersonal) throw new BadRequestException('School students are managed by the school administrator');
    const studentNo = input.studentNo.trim();
    const student = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.student.findUnique({ where: { schoolId_studentNo: { schoolId: classroom.schoolId, studentNo } } });
      if (existing) {
        await tx.enrollment.upsert({
          where: { studentId_classroomId: { studentId: existing.id, classroomId: classroom.id } },
          update: {}, create: { studentId: existing.id, classroomId: classroom.id },
        });
        return existing;
      }
      return tx.student.create({
        data: {
          studentNo, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
          email: input.email?.trim().toLowerCase() || null, schoolId: classroom.schoolId,
          qrCode: `STUDENT:${classroom.schoolId}:${studentNo}:${randomBytes(8).toString('hex')}`,
          enrollments: { create: { classroomId: classroom.id } },
        },
      });
    });
    return studentShape(student);
  }

  async saveTeacherStudent(input: TeacherStudentInput, teacherId: string) {
    const teacher = await this.personalTeacher(teacherId);
    await this.assertTeacherClasses(input.classroomIds, teacher.id, teacher.school!.id);
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
    await this.assertTeacherClasses(classroomIds, teacher.id, teacher.school!.id);
    await this.writeTeacherStudents(inputs, teacher.school!.id);
    return { count: inputs.length };
  }

  private async personalTeacher(teacherId: string) {
    const teacher = await this.prisma.user.findUnique({ where: { id: teacherId }, include: { school: true } });
    if (!teacher || teacher.role !== UserRole.TEACHER) throw new NotFoundException('Teacher account not found');
    if (!teacher.school?.isPersonal) throw new BadRequestException('School students are managed by the school administrator');
    return teacher;
  }

  private async assertTeacherClasses(classroomIds: string[], teacherId: string, schoolId: string) {
    if (!classroomIds.length) return;
    const count = await this.prisma.classroom.count({ where: { id: { in: classroomIds }, teacherId, schoolId } });
    if (count !== classroomIds.length) throw new BadRequestException('One or more selected classes are unavailable');
  }

  private async writeTeacherStudents(inputs: TeacherStudentInput[], schoolId: string) {
    await this.prisma.$transaction(async (tx) => {
      for (const input of inputs) {
        const studentNo = input.studentNo.trim();
        const student = await tx.student.upsert({
          where: { schoolId_studentNo: { schoolId, studentNo } },
          update: { firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email?.trim().toLowerCase() || null },
          create: {
            studentNo, firstName: input.firstName.trim(), lastName: input.lastName.trim(), email: input.email?.trim().toLowerCase() || null,
            schoolId, qrCode: `STUDENT:${schoolId}:${studentNo}:${randomBytes(8).toString('hex')}`,
          },
        });
        if (input.classroomIds.length) {
          await tx.enrollment.createMany({ data: input.classroomIds.map((classroomId) => ({ studentId: student.id, classroomId })), skipDuplicates: true });
        }
      }
    });
  }

  async dashboard(teacherId: string) {
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
      this.prisma.attendance.count({ where: { classroomId: { in: classIds } } }),
      this.prisma.attendance.count({ where: { classroomId: { in: classIds }, status: { in: ['PRESENT', 'LATE'] } } }),
      this.prisma.grade.findMany({
        where: { classroomId: { in: classIds }, quarter: 1 },
        include: { student: true, classroom: { include: { _count: { select: { enrollments: true } } } } },
        orderBy: { finalGrade: 'asc' },
      }),
      this.prisma.enrollment.count({ where: { classroomId: { in: classIds } } }),
    ]);
    const gradedKeys = new Set(grades.map((grade) => `${grade.classroomId}:${grade.studentId}`));

    return {
      teacherName: teacher.name,
      stats: {
        classCount: classes.length,
        studentCount,
        attendanceRate: attendanceTotal ? Math.round((attendancePresent / attendanceTotal) * 1000) / 10 : 0,
        pendingGrades: Math.max(0, enrollmentCount - gradedKeys.size),
      },
      classes: classes.map(classroomShape),
      atRisk: grades.filter((grade) => grade.finalGrade < 75).slice(0, 5).map((grade) => ({
        student: studentShape(grade.student),
        classroom: classroomShape(grade.classroom),
        currentGrade: grade.finalGrade,
      })),
    };
  }

  async classDetail(id: string, date: string | undefined, quarter: number, teacherId: string) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id, teacherId },
      include: {
        _count: { select: { enrollments: true } },
        enrollments: {
          include: {
            student: {
              include: {
                attendances: { where: { classroomId: id, date: dayStart(date ? new Date(date) : new Date()) }, take: 1 },
                grades: { where: { classroomId: id, quarter }, take: 1 },
              },
            },
          },
          orderBy: { student: { lastName: 'asc' } },
        },
      },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
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

  async studentProfile(id: string, teacherId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id, enrollments: { some: { classroom: { teacherId } } } },
      include: {
        grades: { orderBy: [{ quarter: 'desc' }, { createdAt: 'desc' }] },
        attendances: { orderBy: { date: 'desc' }, take: 12 },
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
        this.prisma.attendance.findMany({ where: { studentId: id, classroomId: classroom.id } }),
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

  async setAttendance(classroomId: string, studentId: string, date: string, status: AttendanceStatus, teacherId: string) {
    await this.assertOwnsClass(classroomId, teacherId);
    const attendanceDate = dayStart(new Date(date));
    return this.prisma.attendance.upsert({
      where: { studentId_classroomId_date: { studentId, classroomId, date: attendanceDate } },
      update: { status, checkedAt: status === 'ABSENT' ? null : new Date() },
      create: { studentId, classroomId, date: attendanceDate, status, checkedAt: status === 'ABSENT' ? null : new Date() },
    });
  }

  async saveGrades(input: SaveGradesInput, teacherId: string) {
    await this.assertOwnsClass(input.classroomId, teacherId);
    const gradeRows = input.entries.map((entry) => ({
      ...entry,
      finalGrade: Math.round((entry.quiz * 0.2 + entry.activity * 0.3 + entry.exam * 0.5) * 10) / 10,
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
      let complete = categories.length > 0;
      let finalGrade = 0;
      for (const category of categories) {
        if (!category.assessments.length) { complete = false; continue; }
        let earned = 0;
        let possible = 0;
        for (const assessment of category.assessments) {
          const entry = assessment.scores.find((score) => score.studentId === student.id);
          if (entry?.score === undefined) complete = false;
          else earned += entry.score;
          possible += assessment.maxScore;
        }
        if (possible > 0) finalGrade += (earned / possible) * category.weight;
      }
      return { student: studentShape(student), finalGrade: complete ? Math.round(finalGrade * 100) / 100 : undefined };
    });
    return { classroom: classroomShape(classroom), schemeName: classroom.gradingScheme?.name, categories, students };
  }

  async createAssessment(input: CreateAssessmentInput, teacherId: string) {
    await this.assertOwnsClass(input.classroomId, teacherId);
    const category = await this.prisma.gradeCategory.findFirst({
      where: { id: input.categoryId, scheme: { classrooms: { some: { id: input.classroomId } } } },
    });
    if (!category) throw new BadRequestException('This category is not part of the class grading template');
    return this.prisma.assessment.create({
      data: { classroomId: input.classroomId, categoryId: input.categoryId, title: input.title.trim(), maxScore: input.maxScore, quarter: input.quarter },
    });
  }

  async saveAssessmentScores(input: SaveAssessmentScoresInput, teacherId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: input.assessmentId, classroom: { teacherId } },
      include: { classroom: { include: { enrollments: true } } },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
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
    return { count: input.scores.length, grades: [] };
  }

  private async assertOwnsClass(classroomId: string, teacherId: string) {
    const classroom = await this.prisma.classroom.findFirst({ where: { id: classroomId, teacherId }, select: { id: true } });
    if (!classroom) throw new NotFoundException('Classroom not found');
  }
}
