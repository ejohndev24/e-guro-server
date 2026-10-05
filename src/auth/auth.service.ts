import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser, RegisterTeacherInput } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  private publicUser(user: User & { school?: { isPersonal: boolean } | null }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId ?? undefined,
      mustChangePassword: user.mustChangePassword,
      isIndependent: user.school?.isPersonal ?? false,
    };
  }

  private async payload(user: User & { school?: { isPersonal: boolean } | null }) {
    const claims: JwtUser = { sub: user.id, email: user.email, role: user.role, schoolId: user.schoolId ?? undefined };
    return { accessToken: await this.jwt.signAsync(claims), user: this.publicUser(user) };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, include: { school: { select: { isPersonal: true } } } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.payload(user);
  }

  async registerTeacher(input: RegisterTeacherInput) {
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new BadRequestException('An account already uses this email');
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { name: `${input.name.trim()}'s Workspace`, code: `P${randomBytes(5).toString('hex').toUpperCase()}`, isPersonal: true },
      });
      const teacher = await tx.user.create({
        data: { name: input.name.trim(), email, passwordHash, role: 'TEACHER', schoolId: school.id, mustChangePassword: false },
      });
      await tx.gradingScheme.create({
        data: {
          name: 'DepEd G1-10 Languages / AP / EsP', educationLevel: 'ELEMENTARY', status: 'ACTIVE', schoolId: school.id,
          categories: { create: [
            { name: 'Written Works', weight: 30, position: 0 },
            { name: 'Performance Tasks', weight: 50, position: 1 },
            { name: 'Quarterly Assessment', weight: 20, position: 2 },
          ] },
        },
      });
      return { ...teacher, school: { isPersonal: true } };
    });
    return this.payload(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { school: { select: { isPersonal: true } } } });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (newPassword.length < 10) throw new UnauthorizedException('New password must be at least 10 characters');
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(newPassword), mustChangePassword: false },
      include: { school: { select: { isPersonal: true } } },
    });
    return this.publicUser(updated);
  }
}
