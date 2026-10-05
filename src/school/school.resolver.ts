import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';
import { SchoolService } from './school.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { JwtUser } from '../auth/auth.types';
import {
  Attendance,
  AddStudentToClassInput,
  ClassDetail,
  Classroom,
  CreateAssessmentInput,
  ConfigureClassGradingInput,
  Dashboard,
  Gradebook,
  SaveGradesInput,
  SaveGradesPayload,
  SaveAssessmentScoresInput,
  SaveGradebookScoresInput,
  Student,
  StudentProfile,
  TeacherStudentInput,
  TeacherClassInput,
  ImportStudentsPayload,
} from './school.types';

@Resolver()
@UseGuards(GqlAuthGuard)
export class SchoolResolver {
  constructor(private readonly school: SchoolService) {}

  @Query(() => Dashboard)
  dashboard(
    @CurrentUser() user: JwtUser,
    @Args('quarter', { type: () => Int, defaultValue: 1 }) quarter: number,
  ) {
    return this.school.dashboard(user.sub, quarter);
  }

  @Query(() => [Classroom])
  classes(@CurrentUser() user: JwtUser) {
    return this.school.classes(user.sub);
  }

  @Mutation(() => Classroom)
  createClass(@Args('input') input: TeacherClassInput, @CurrentUser() user: JwtUser) {
    return this.school.createClass(input, user.sub);
  }

  @Mutation(() => Student)
  addStudentToClass(@Args('input') input: AddStudentToClassInput, @CurrentUser() user: JwtUser) {
    return this.school.addStudentToClass(input, user.sub);
  }

  @Mutation(() => Student)
  saveTeacherStudent(@Args('input') input: TeacherStudentInput, @CurrentUser() user: JwtUser) {
    return this.school.saveTeacherStudent(input, user.sub);
  }

  @Mutation(() => ImportStudentsPayload)
  importTeacherStudents(@Args('inputs', { type: () => [TeacherStudentInput] }) inputs: TeacherStudentInput[], @CurrentUser() user: JwtUser) {
    return this.school.importTeacherStudents(inputs, user.sub);
  }

  @Query(() => ClassDetail)
  classDetail(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: JwtUser,
    @Args('quarter', { type: () => Int, defaultValue: 1 }) quarter: number,
    @Args('date', { nullable: true }) date?: string,
  ) {
    return this.school.classDetail(id, date, quarter, user.sub);
  }

  @Query(() => [Student])
  students(@CurrentUser() user: JwtUser, @Args('search', { nullable: true }) search?: string) {
    return this.school.students(user.sub, search);
  }

  @Query(() => StudentProfile)
  student(@Args('id', { type: () => ID }) id: string, @CurrentUser() user: JwtUser) {
    return this.school.studentProfile(id, user.sub);
  }

  @Mutation(() => Attendance)
  setAttendance(
    @Args('classroomId', { type: () => ID }) classroomId: string,
    @Args('studentId', { type: () => ID }) studentId: string,
    @Args('date') date: string,
    @Args('status', { type: () => AttendanceStatus }) status: AttendanceStatus,
    @CurrentUser() user: JwtUser,
  ) {
    return this.school.setAttendance(classroomId, studentId, date, status, user.sub);
  }

  @Mutation(() => SaveGradesPayload)
  saveGrades(@Args('input') input: SaveGradesInput, @CurrentUser() user: JwtUser) {
    return this.school.saveGrades(input, user.sub);
  }

  @Query(() => Gradebook)
  gradebook(
    @Args('classroomId', { type: () => ID }) classroomId: string,
    @Args('quarter', { type: () => Int, defaultValue: 1 }) quarter: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.school.gradebook(classroomId, quarter, user.sub);
  }

  @Mutation(() => Gradebook)
  async createAssessment(@Args('input') input: CreateAssessmentInput, @CurrentUser() user: JwtUser) {
    await this.school.createAssessment(input, user.sub);
    return this.school.gradebook(input.classroomId, input.quarter, user.sub);
  }

  @Mutation(() => SaveGradesPayload)
  saveAssessmentScores(@Args('input') input: SaveAssessmentScoresInput, @CurrentUser() user: JwtUser) {
    return this.school.saveAssessmentScores(input, user.sub);
  }

  @Mutation(() => SaveGradesPayload)
  saveGradebookScores(@Args('input') input: SaveGradebookScoresInput, @CurrentUser() user: JwtUser) {
    return this.school.saveGradebookScores(input, user.sub);
  }

  @Mutation(() => Gradebook)
  async configureClassGrading(@Args('input') input: ConfigureClassGradingInput, @CurrentUser() user: JwtUser) {
    await this.school.configureClassGrading(input, user.sub);
    return this.school.gradebook(input.classroomId, input.quarter, user.sub);
  }
}
