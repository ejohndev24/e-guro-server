import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AddStudentToClassInput, ConfigureClassGradingInput, CreateAssessmentInput, SaveAssessmentScoresInput, SaveGradebookScoresInput, SaveGradesInput, TeacherClassInput, TeacherStudentInput } from './school.types';
import { computeStudentGrade, GradeCategoryResult, transmuteDepEdGrade, usesDepEdTransmutation } from './grading';

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
      this.prisma.attendance.count({ where: { classroomId: { in: classIds } } }),
      this.prisma.attendance.count({ where: { classroomId: { in: classIds }, status: { in: ['PRESENT', 'LATE'] } } }),
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
    const classroom = await this.prisma.classroom.findFirst({
      where: { id: input.classroomId, teacherId },
      include: { gradingScheme: true },
    });
    if (!classroom) throw new NotFoundException('Classroom not found');
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
}
