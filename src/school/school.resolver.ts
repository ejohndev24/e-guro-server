/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AttendanceScope, AttendanceStatus, SchoolReportKind, SchoolReportStatus } from '@prisma/client';
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
  CreateStudentGroupInput,
  SetGroupAdviserInput,
  ConfigureClassGradingInput,
  Dashboard,
  Gradebook,
  SaveGradesInput,
  SaveGradesPayload,
  SaveAssessmentScoresInput,
  SaveGradebookScoresInput,
  Student,
  StudentGroup,
  StudentProfile,
  TeacherStudentInput,
  TeacherClassInput,
  ImportStudentsPayload,
} from './school.types';
import { ObservedValueEntry, ReportSchool, ReportStatusPayload, SaveObservedValueInput, Sf2Report, Sf5Report, Sf9Report, UpdateSchoolProfileInput } from './school.report-types';

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

  @Mutation(() => Boolean)
  deleteClass(@Args('classroomId', { type: () => ID }) classroomId: string, @CurrentUser() user: JwtUser) {
    return this.school.deleteClass(classroomId, user.sub);
  }

  @Mutation(() => StudentGroup)
  createStudentGroup(@Args('input') input: CreateStudentGroupInput, @CurrentUser() user: JwtUser) {
    return this.school.createStudentGroup(input, user.sub);
  }

  @Mutation(() => Boolean)
  deleteStudentGroup(@Args('groupId', { type: () => ID }) groupId: string, @CurrentUser() user: JwtUser) {
    return this.school.deleteStudentGroup(groupId, user.sub);
  }

  @Mutation(() => Boolean)
  removeStudentFromGroup(@Args('groupId', { type: () => ID }) groupId: string, @Args('studentId', { type: () => ID }) studentId: string, @CurrentUser() user: JwtUser) {
    return this.school.removeStudentFromGroup(groupId, studentId, user.sub);
  }

  @Mutation(() => StudentGroup)
  setGroupAdviser(@Args('input') input: SetGroupAdviserInput, @CurrentUser() user: JwtUser) {
    return this.school.setGroupAdviser(input, user.sub);
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
    @Args('attendanceScope', { type: () => AttendanceScope, defaultValue: AttendanceScope.SUBJECT }) attendanceScope?: AttendanceScope,
  ) {
    return this.school.classDetail(id, date, quarter, user.sub, attendanceScope);
  }

  @Query(() => [Student])
  students(@CurrentUser() user: JwtUser, @Args('search', { nullable: true }) search?: string) {
    return this.school.students(user.sub, search);
  }

  @Query(() => [StudentGroup])
  studentGroups(@CurrentUser() user: JwtUser) {
    return this.school.studentGroups(user.sub);
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
    @Args('reason', { type: () => String, nullable: true }) reason: string,
    @Args('scope', { type: () => AttendanceScope, defaultValue: AttendanceScope.SUBJECT }) scope: AttendanceScope,
    @CurrentUser() user: JwtUser,
  ) {
    return this.school.setAttendance(classroomId, studentId, date, status, user.sub, scope, reason);
  }

  @Query(() => Sf2Report)
  sf2Report(@Args('classroomId', { type: () => ID }) classroomId: string, @Args('month') month: string, @CurrentUser() user: JwtUser) {
    return this.school.sf2Report(classroomId, month, user.sub);
  }

  @Query(() => Sf9Report)
  sf9Report(@Args('classroomId', { type: () => ID }) classroomId: string, @Args('studentId', { type: () => ID }) studentId: string, @CurrentUser() user: JwtUser) {
    return this.school.sf9Report(classroomId, studentId, user.sub);
  }

  @Query(() => Sf5Report)
  sf5Report(@Args('classroomId', { type: () => ID }) classroomId: string, @CurrentUser() user: JwtUser) {
    return this.school.sf5Report(classroomId, user.sub);
  }

  @Mutation(() => ReportStatusPayload)
  setSchoolReportStatus(
    @Args('kind', { type: () => SchoolReportKind }) kind: SchoolReportKind,
    @Args('classroomId', { type: () => ID }) classroomId: string,
    @Args('periodKey') periodKey: string,
    @Args('status', { type: () => SchoolReportStatus }) status: SchoolReportStatus,
    @CurrentUser() user: JwtUser,
    @Args('studentId', { type: () => ID, nullable: true }) studentId?: string,
  ) { return this.school.setReportStatus(kind, classroomId, periodKey, status, user.sub, studentId); }

  @Query(() => ReportSchool)
  mySchoolProfile(@CurrentUser() user: JwtUser) { return this.school.mySchoolProfile(user.sub); }

  @Mutation(() => ReportSchool)
  updateMySchoolProfile(@Args('input') input: UpdateSchoolProfileInput, @CurrentUser() user: JwtUser) { return this.school.updateMySchoolProfile(input, user.sub); }

  @Mutation(() => ObservedValueEntry)
  saveObservedValue(@Args('input') input: SaveObservedValueInput, @CurrentUser() user: JwtUser) { return this.school.saveObservedValue(input, user.sub); }

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
