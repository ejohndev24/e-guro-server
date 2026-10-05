import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ForbiddenException, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { JwtUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import {
  AdminClassroom,
  AdminStudent,
  CreateGradingSchemeInput,
  CreateSchoolInput,
  GradingSchemeView,
  InvitationPayload,
  InviteTeacherInput,
  SaveStudentInput,
  SaveClassroomInput,
  SchoolDetail,
  SchoolSummary,
} from './admin.types';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
export class AdminResolver {
  constructor(private readonly admin: AdminService) {}

  @Query(() => [SchoolSummary])
  @Roles(UserRole.SUPER_ADMIN)
  schools() { return this.admin.schools(); }

  @Query(() => SchoolDetail)
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  school(@Args('id', { type: () => ID }) id: string, @CurrentUser() user: JwtUser) {
    if (user.role === UserRole.SCHOOL_ADMIN && user.schoolId !== id) throw new ForbiddenException('You can only view your school');
    return this.admin.school(id);
  }

  @Mutation(() => InvitationPayload)
  @Roles(UserRole.SUPER_ADMIN)
  createSchool(@Args('input') input: CreateSchoolInput) { return this.admin.createSchool(input); }

  @Mutation(() => InvitationPayload)
  @Roles(UserRole.SCHOOL_ADMIN)
  inviteTeacher(@Args('input') input: InviteTeacherInput, @CurrentUser() user: JwtUser) {
    if (user.schoolId !== input.schoolId) throw new ForbiddenException('You can only invite teachers to your school');
    return this.admin.inviteTeacher(input);
  }

  @Mutation(() => InvitationPayload)
  @Roles(UserRole.SCHOOL_ADMIN)
  resendTeacherInvitation(@Args('userId', { type: () => ID }) userId: string, @CurrentUser() user: JwtUser) {
    if (!user.schoolId) throw new ForbiddenException('A school administrator account is required');
    return this.admin.resendTeacherInvitation(userId, user.schoolId);
  }

  @Mutation(() => InvitationPayload)
  @Roles(UserRole.SUPER_ADMIN)
  resendSchoolAdminInvitation(@Args('userId', { type: () => ID }) userId: string) {
    return this.admin.resendSchoolAdminInvitation(userId);
  }

  @Query(() => [AdminStudent])
  @Roles(UserRole.SCHOOL_ADMIN)
  schoolStudents(
    @Args('schoolId', { type: () => ID }) schoolId: string,
    @CurrentUser() user: JwtUser,
    @Args('search', { nullable: true }) search?: string,
  ) {
    this.assertSchoolAccess(user, schoolId);
    return this.admin.schoolStudents(schoolId, search);
  }

  @Query(() => [AdminClassroom])
  @Roles(UserRole.SCHOOL_ADMIN)
  schoolClasses(@Args('schoolId', { type: () => ID }) schoolId: string, @CurrentUser() user: JwtUser) {
    this.assertSchoolAccess(user, schoolId);
    return this.admin.schoolClasses(schoolId);
  }

  @Mutation(() => AdminClassroom)
  @Roles(UserRole.SCHOOL_ADMIN)
  saveClassroom(@Args('input') input: SaveClassroomInput, @CurrentUser() user: JwtUser) {
    this.assertSchoolAccess(user, input.schoolId);
    return this.admin.saveClassroom(input);
  }

  @Mutation(() => AdminStudent)
  @Roles(UserRole.SCHOOL_ADMIN)
  saveStudent(@Args('input') input: SaveStudentInput, @CurrentUser() user: JwtUser) {
    this.assertSchoolAccess(user, input.schoolId);
    return this.admin.saveStudent(input);
  }

  @Query(() => [GradingSchemeView])
  @Roles(UserRole.SCHOOL_ADMIN)
  gradingSchemes(@Args('schoolId', { type: () => ID }) schoolId: string, @CurrentUser() user: JwtUser) {
    this.assertSchoolAccess(user, schoolId);
    return this.admin.gradingSchemes(schoolId);
  }

  @Mutation(() => GradingSchemeView)
  @Roles(UserRole.SCHOOL_ADMIN)
  createGradingScheme(@Args('input') input: CreateGradingSchemeInput, @CurrentUser() user: JwtUser) {
    this.assertSchoolAccess(user, input.schoolId);
    return this.admin.createGradingScheme(input);
  }

  private assertSchoolAccess(user: JwtUser, schoolId: string) {
    if (user.role === UserRole.SCHOOL_ADMIN && user.schoolId !== schoolId) {
      throw new ForbiddenException('You can only manage your own school');
    }
  }
}
