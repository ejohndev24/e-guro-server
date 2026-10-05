import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradingSchemeInput, CreateSchoolInput, InviteTeacherInput, SaveClassroomInput, SaveStudentInput } from './admin.types';
import { MailService } from './mail.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private temporaryPassword() {
    return `${randomBytes(7).toString('base64url')}!aA7`;
  }

  private publicUser(user: { id: string; name: string; email: string; role: UserRole; schoolId: string | null; mustChangePassword: boolean }) {
    return { ...user, schoolId: user.schoolId ?? undefined };
  }

  private summary(school: any) {
    return {
      id: school.id,
      name: school.name,
      code: school.code,
      createdAt: school.createdAt,
      teacherCount: school._count?.users ?? 0,
      classCount: school._count?.classes ?? school.classes?.length ?? 0,
      studentCount: school._count?.students ?? 0,
    };
  }

  async schools() {
    const schools = await this.prisma.school.findMany({
      where: { isPersonal: false },
      include: { _count: { select: { users: { where: { role: UserRole.TEACHER } }, classes: true, students: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return schools.map((school) => this.summary(school));
  }

  async school(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: { users: { orderBy: [{ role: 'asc' }, { name: 'asc' }] }, _count: { select: { users: { where: { role: UserRole.TEACHER } }, classes: true, students: true } } },
    });
    if (!school) throw new NotFoundException('School not found');
    return { school: this.summary(school), users: school.users.map((user) => this.publicUser(user)) };
  }

  async createSchool(input: CreateSchoolInput) {
    const code = input.code.trim().toUpperCase();
    const email = input.adminEmail.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('That email already has an account');
    const temporaryPassword = this.temporaryPassword();
    const school = await this.prisma.school.create({
      data: {
        name: input.name.trim(),
        code,
        users: { create: { name: input.adminName.trim(), email, passwordHash: await argon2.hash(temporaryPassword), role: UserRole.SCHOOL_ADMIN, mustChangePassword: true } },
      },
      include: { users: true },
    });
    const administrator = school.users[0]!;
    let emailSent: boolean;
    try {
      emailSent = await this.mail.sendTemporaryPassword({ name: administrator.name, email, schoolName: school.name, temporaryPassword, role: 'SCHOOL_ADMIN' });
    } catch (error) {
      await this.prisma.school.delete({ where: { id: school.id } });
      throw error;
    }
    return { user: this.publicUser(administrator), emailSent };
  }

  async inviteTeacher(input: InviteTeacherInput) {
    const school = await this.prisma.school.findUnique({ where: { id: input.schoolId } });
    if (!school) throw new NotFoundException('School not found');
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('That email already has an account');
    const temporaryPassword = this.temporaryPassword();
    const teacher = await this.prisma.user.create({
      data: { name: input.name.trim(), email, passwordHash: await argon2.hash(temporaryPassword), role: UserRole.TEACHER, schoolId: school.id, mustChangePassword: true },
    });
    let emailSent: boolean;
    try {
      emailSent = await this.mail.sendTemporaryPassword({ name: teacher.name, email, schoolName: school.name, temporaryPassword, role: 'TEACHER' });
    } catch (error) {
      await this.prisma.user.delete({ where: { id: teacher.id } });
      throw error;
    }
    return { user: this.publicUser(teacher), emailSent };
  }

  async resendTeacherInvitation(userId: string, schoolId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: userId, schoolId, role: UserRole.TEACHER },
      include: { school: true },
    });
    if (!teacher?.school) throw new NotFoundException('Teacher account not found in your school');
    const temporaryPassword = this.temporaryPassword();
    const emailSent = await this.mail.sendTemporaryPassword({
      name: teacher.name,
      email: teacher.email,
      schoolName: teacher.school.name,
      temporaryPassword,
      role: 'TEACHER',
    });
    const updated = await this.prisma.user.update({
      where: { id: teacher.id },
      data: { passwordHash: await argon2.hash(temporaryPassword), mustChangePassword: true },
    });
    return { user: this.publicUser(updated), emailSent };
  }

  async resendSchoolAdminInvitation(userId: string) {
    const administrator = await this.prisma.user.findFirst({
      where: { id: userId, role: UserRole.SCHOOL_ADMIN },
      include: { school: true },
    });
    if (!administrator?.school) throw new NotFoundException('School administrator account not found');
    const temporaryPassword = this.temporaryPassword();
    const emailSent = await this.mail.sendTemporaryPassword({
      name: administrator.name,
      email: administrator.email,
      schoolName: administrator.school.name,
      temporaryPassword,
      role: 'SCHOOL_ADMIN',
    });
    const updated = await this.prisma.user.update({
      where: { id: administrator.id },
      data: { passwordHash: await argon2.hash(temporaryPassword), mustChangePassword: true },
    });
    return { user: this.publicUser(updated), emailSent };
  }

  async schoolStudents(schoolId: string, search?: string) {
    const term = search?.trim();
    const students = await this.prisma.student.findMany({
      where: {
        schoolId,
        ...(term ? { OR: [
          { studentNo: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ] } : {}),
      },
      include: { enrollments: { include: { classroom: { include: { teacher: true } } } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return students.map((student) => ({
      ...student,
      email: student.email ?? undefined,
      classes: student.enrollments.map(({ classroom }) => ({ ...classroom, teacherName: classroom.teacher.name })),
    }));
  }

  async schoolClasses(schoolId: string) {
    const classes = await this.prisma.classroom.findMany({
      where: { schoolId },
      include: { teacher: true, gradingScheme: true, _count: { select: { enrollments: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { section: 'asc' }, { subject: 'asc' }],
    });
    return classes.map((classroom) => ({
      ...classroom,
      teacherName: classroom.teacher.name,
      gradingSchemeName: classroom.gradingScheme?.name,
      studentCount: classroom._count.enrollments,
    }));
  }

  async saveClassroom(input: SaveClassroomInput) {
    const teacher = await this.prisma.user.findFirst({
      where: { id: input.teacherId, schoolId: input.schoolId, role: UserRole.TEACHER },
    });
    if (!teacher) throw new BadRequestException('Select a teacher from this school');
    if (input.startTime >= input.endTime) throw new BadRequestException('End time must be later than start time');
    if (input.gradingSchemeId) {
      const scheme = await this.prisma.gradingScheme.findFirst({ where: { id: input.gradingSchemeId, schoolId: input.schoolId } });
      if (!scheme) throw new BadRequestException('Select a grading template from this school');
    }
    const data = {
      subject: input.subject.trim(),
      gradeLevel: input.gradeLevel,
      section: input.section.trim(),
      room: input.room.trim(),
      scheduleDay: input.scheduleDay.trim(),
      startTime: input.startTime,
      endTime: input.endTime,
      schoolYear: input.schoolYear.trim(),
      term: input.term.trim(),
      teacherId: teacher.id,
      gradingSchemeId: input.gradingSchemeId || null,
    };
    let savedId: string;
    if (input.id) {
      const existing = await this.prisma.classroom.findFirst({ where: { id: input.id, schoolId: input.schoolId } });
      if (!existing) throw new NotFoundException('Class not found');
      const updated = await this.prisma.classroom.update({ where: { id: existing.id }, data });
      savedId = updated.id;
    } else {
      const created = await this.prisma.classroom.create({ data: { ...data, schoolId: input.schoolId } });
      savedId = created.id;
    }
    const classes = await this.schoolClasses(input.schoolId);
    const saved = classes.find((classroom) => classroom.id === savedId);
    if (!saved) throw new NotFoundException('Saved class could not be loaded');
    return saved;
  }

  async saveStudent(input: SaveStudentInput) {
    await this.assertSchoolClasses(input.schoolId, input.classroomIds);
    const data = {
      studentNo: input.studentNo.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim().toLowerCase() || null,
    };
    const duplicate = await this.prisma.student.findFirst({
      where: { schoolId: input.schoolId, studentNo: data.studentNo, ...(input.id ? { id: { not: input.id } } : {}) },
    });
    if (duplicate) throw new BadRequestException('That student number is already used in this school');

    const student = await this.prisma.$transaction(async (tx) => {
      if (input.id) {
        const existing = await tx.student.findFirst({ where: { id: input.id, schoolId: input.schoolId } });
        if (!existing) throw new NotFoundException('Student not found');
        await tx.enrollment.deleteMany({ where: { studentId: existing.id } });
        return tx.student.update({
          where: { id: existing.id },
          data: { ...data, enrollments: { create: input.classroomIds.map((classroomId) => ({ classroomId })) } },
        });
      }
      const qrCode = `STUDENT:${input.schoolId}:${data.studentNo}:${randomBytes(8).toString('hex')}`;
      return tx.student.create({
        data: { ...data, qrCode, schoolId: input.schoolId, enrollments: { create: input.classroomIds.map((classroomId) => ({ classroomId })) } },
      });
    });
    return (await this.schoolStudents(input.schoolId)).find((item) => item.id === student.id)!;
  }

  async gradingSchemes(schoolId: string) {
    const schemes = await this.prisma.gradingScheme.findMany({
      where: { schoolId },
      include: { categories: { orderBy: { position: 'asc' } }, classrooms: { include: { teacher: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return schemes.map((scheme) => ({
      ...scheme,
      categories: scheme.categories.map((category) => ({ ...category, weight: Number(category.weight) })),
      totalWeight: scheme.categories.reduce((sum, category) => sum + Number(category.weight), 0),
      classes: scheme.classrooms.map((classroom) => ({ ...classroom, teacherName: classroom.teacher.name })),
    }));
  }

  async createGradingScheme(input: CreateGradingSchemeInput) {
    if (!input.categories.length) throw new BadRequestException('Add at least one grading category');
    const total = Math.round(input.categories.reduce((sum, category) => sum + category.weight, 0) * 100) / 100;
    if (total !== 100) throw new BadRequestException(`Category weights must equal 100%. Current total is ${total}%`);
    const names = input.categories.map((category) => category.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Category names must be unique');
    await this.assertSchoolClasses(input.schoolId, input.classroomIds);
    const previous = await this.prisma.gradingScheme.findFirst({
      where: { schoolId: input.schoolId, name: { equals: input.name.trim(), mode: 'insensitive' } },
      orderBy: { version: 'desc' },
    });
    const scheme = await this.prisma.gradingScheme.create({
      data: {
        name: input.name.trim(),
        educationLevel: input.educationLevel,
        status: 'ACTIVE',
        version: (previous?.version ?? 0) + 1,
        schoolId: input.schoolId,
        categories: { create: input.categories.map((category, position) => ({ name: category.name.trim(), weight: category.weight, position })) },
      },
    });
    if (input.classroomIds.length) {
      await this.prisma.classroom.updateMany({
        where: { schoolId: input.schoolId, id: { in: input.classroomIds } },
        data: { gradingSchemeId: scheme.id },
      });
    }
    return (await this.gradingSchemes(input.schoolId)).find((item) => item.id === scheme.id)!;
  }

  private async assertSchoolClasses(schoolId: string, classroomIds: string[]) {
    if (!classroomIds.length) return;
    const count = await this.prisma.classroom.count({ where: { schoolId, id: { in: classroomIds } } });
    if (count !== classroomIds.length) throw new BadRequestException('One or more selected classes do not belong to this school');
  }
}
