/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AttendanceScope, AttendanceStatus, EducationLevel, LearnerSex } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

registerEnumType(AttendanceStatus, { name: 'AttendanceStatus' });
registerEnumType(AttendanceScope, { name: 'AttendanceScope' });
registerEnumType(EducationLevel, { name: 'EducationLevel' });
registerEnumType(LearnerSex, { name: 'LearnerSex' });

@ObjectType()
export class Student {
  @Field(() => ID) id!: string;
  @Field() studentNo!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() fullName!: string;
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) lrn?: string;
  @Field({ nullable: true }) birthDate?: Date;
  @Field(() => LearnerSex, { nullable: true }) sex?: LearnerSex;
}

@ObjectType()
export class Classroom {
  @Field(() => ID) id!: string;
  @Field(() => Int) gradeLevel!: number;
  @Field() section!: string;
  @Field() subject!: string;
  @Field() room!: string;
  @Field() scheduleDay!: string;
  @Field() startTime!: string;
  @Field() endTime!: string;
  @Field() schoolYear!: string;
  @Field() term!: string;
  @Field(() => Int) studentCount!: number;
  @Field() displayName!: string;
  @Field(() => EducationLevel) educationLevel!: EducationLevel;
  @Field() isAdvisory!: boolean;
}

@ObjectType()
export class Attendance {
  @Field(() => ID) id!: string;
  @Field() date!: Date;
  @Field({ nullable: true }) checkedAt?: Date;
  @Field(() => AttendanceStatus) status!: AttendanceStatus;
  @Field({ nullable: true }) reason?: string;
  @Field(() => AttendanceScope) scope!: AttendanceScope;
}

@ObjectType()
export class Grade {
  @Field(() => ID) id!: string;
  @Field(() => Int) quarter!: number;
  @Field(() => Float) quiz!: number;
  @Field(() => Float) activity!: number;
  @Field(() => Float) exam!: number;
  @Field(() => Float) finalGrade!: number;
}

@ObjectType()
export class RosterStudent {
  @Field(() => Student) student!: Student;
  @Field(() => Attendance, { nullable: true }) attendance?: Attendance;
  @Field(() => Grade, { nullable: true }) grade?: Grade;
}

@ObjectType()
export class ClassDetail {
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => [RosterStudent]) roster!: RosterStudent[];
}

@ObjectType()
export class StudentGroup {
  @Field(() => ID) id!: string;
  @Field(() => Int) gradeLevel!: number;
  @Field() section!: string;
  @Field() schoolYear!: string;
  @Field() term!: string;
  @Field(() => EducationLevel) educationLevel!: EducationLevel;
  @Field() displayName!: string;
  @Field(() => Int) studentCount!: number;
  @Field() isAdvisory!: boolean;
  @Field(() => [Classroom]) classes!: Classroom[];
  @Field(() => [Student]) students!: Student[];
}

@InputType()
export class CreateStudentGroupInput {
  @Field(() => Int) @IsInt() @Min(0) @Max(20) gradeLevel!: number;
  @Field() @IsString() @MinLength(1) section!: string;
  @Field() @Matches(/^\d{4}-\d{4}$/) schoolYear!: string;
  @Field() @IsString() @MinLength(1) term!: string;
  @Field(() => EducationLevel) @IsEnum(EducationLevel) educationLevel!: EducationLevel;
  @Field({ defaultValue: false }) @IsBoolean() isAdvisory!: boolean;
}

@InputType()
export class SetGroupAdviserInput {
  @Field(() => ID) @IsString() groupId!: string;
  @Field() @IsBoolean() isAdvisory!: boolean;
}

@ObjectType()
export class DashboardStats {
  @Field(() => Int) classCount!: number;
  @Field(() => Int) studentCount!: number;
  @Field(() => Float) attendanceRate!: number;
  @Field(() => Int) pendingGrades!: number;
  @Field(() => Float, { nullable: true }) averageGrade?: number;
}

@ObjectType()
export class AtRiskStudent {
  @Field(() => Student) student!: Student;
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => Float) currentGrade!: number;
}

@ObjectType()
export class ClassGradeReport {
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => Float, { nullable: true }) averageGrade?: number;
  @Field(() => Int) gradedStudents!: number;
  @Field(() => Int) studentCount!: number;
  @Field(() => Int) passingStudents!: number;
}

@ObjectType()
export class Dashboard {
  @Field() teacherName!: string;
  @Field(() => DashboardStats) stats!: DashboardStats;
  @Field(() => [Classroom]) classes!: Classroom[];
  @Field(() => [AtRiskStudent]) atRisk!: AtRiskStudent[];
  @Field(() => [ClassGradeReport]) gradeReports!: ClassGradeReport[];
}

@ObjectType()
export class StudentClassSummary {
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => Float, { nullable: true }) averageGrade?: number;
  @Field(() => Float) attendanceRate!: number;
}

@ObjectType()
export class StudentProfile {
  @Field(() => Student) student!: Student;
  @Field(() => [StudentClassSummary]) classes!: StudentClassSummary[];
  @Field(() => [Attendance]) recentAttendance!: Attendance[];
  @Field(() => [Grade]) grades!: Grade[];
  @Field(() => Float) overallGrade!: number;
  @Field(() => Float) attendanceRate!: number;
}

@InputType()
export class TeacherClassInput {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() groupId?: string;
  @Field() @IsString() @MinLength(1) subject!: string;
  @Field(() => Int) @IsInt() @Min(0) @Max(20) gradeLevel!: number;
  @Field() @IsString() @MinLength(1) section!: string;
  @Field() @IsString() @MinLength(1) room!: string;
  @Field() @IsString() @MinLength(1) scheduleDay!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @Field() @Matches(/^\d{4}-\d{4}$/) schoolYear!: string;
  @Field() @IsString() @MinLength(1) term!: string;
  @Field(() => EducationLevel) @IsEnum(EducationLevel) educationLevel!: EducationLevel;
  @Field({ defaultValue: false }) @IsBoolean() isAdvisory!: boolean;
}

@InputType()
export class AddStudentToClassInput {
  @Field(() => ID) @IsString() classroomId!: string;
  @Field() @IsString() @MinLength(1) studentNo!: string;
  @Field() @IsString() @MinLength(1) firstName!: string;
  @Field() @IsString() @MinLength(1) lastName!: string;
  @Field({ nullable: true }) @IsOptional() @IsEmail() email?: string;
}

@InputType()
export class TeacherStudentInput {
  @Field() @IsString() @MinLength(1) studentNo!: string;
  @Field() @IsString() @MinLength(1) firstName!: string;
  @Field() @IsString() @MinLength(1) lastName!: string;
  @Field({ nullable: true }) @IsOptional() @IsEmail() email?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() lrn?: string;
  @Field({ nullable: true }) @IsOptional() @IsDateString() birthDate?: string;
  @Field(() => LearnerSex, { nullable: true }) @IsOptional() @IsEnum(LearnerSex) sex?: LearnerSex;
  @Field(() => [ID], { defaultValue: [] }) @IsArray() @ArrayUnique() @IsString({ each: true }) classroomIds!: string[];
  @Field(() => [ID], { defaultValue: [] }) @IsArray() @ArrayUnique() @IsString({ each: true }) groupIds!: string[];
}

@ObjectType()
export class ImportStudentsPayload {
  @Field(() => Int) count!: number;
}

@InputType()
export class GradeEntryInput {
  @Field() @IsString() studentId!: string;
  @Field(() => Float) @IsNumber() @Min(0) @Max(100) quiz!: number;
  @Field(() => Float) @IsNumber() @Min(0) @Max(100) activity!: number;
  @Field(() => Float) @IsNumber() @Min(0) @Max(100) exam!: number;
}

@InputType()
export class SaveGradesInput {
  @Field() @IsString() classroomId!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(4) quarter!: number;
  @Field(() => [GradeEntryInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => GradeEntryInput) entries!: GradeEntryInput[];
}

@ObjectType()
export class SaveGradesPayload {
  @Field(() => Int) count!: number;
  @Field(() => [Grade]) grades!: Grade[];
}

@ObjectType()
export class GradebookScore {
  @Field(() => ID) studentId!: string;
  @Field(() => Float, { nullable: true }) score?: number;
}

@ObjectType()
export class GradebookAssessment {
  @Field(() => ID) id!: string;
  @Field() title!: string;
  @Field(() => Float) maxScore!: number;
  @Field(() => [GradebookScore]) scores!: GradebookScore[];
}

@ObjectType()
export class GradebookCategory {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => Float) weight!: number;
  @Field(() => [GradebookAssessment]) assessments!: GradebookAssessment[];
}

@ObjectType()
export class GradebookStudent {
  @Field(() => Student) student!: Student;
  @Field(() => Float, { nullable: true }) initialGrade?: number;
  @Field(() => Float, { nullable: true }) finalGrade?: number;
}

@ObjectType()
export class Gradebook {
  @Field(() => Classroom) classroom!: Classroom;
  @Field({ nullable: true }) schemeName?: string;
  @Field(() => [GradebookCategory]) categories!: GradebookCategory[];
  @Field(() => [GradebookStudent]) students!: GradebookStudent[];
}

@InputType()
export class CreateAssessmentInput {
  @Field(() => ID) @IsString() classroomId!: string;
  @Field(() => ID) @IsString() categoryId!: string;
  @Field() @IsString() title!: string;
  @Field(() => Float) @IsNumber() @Min(0.01) maxScore!: number;
  @Field(() => Int) @IsInt() @Min(1) @Max(4) quarter!: number;
}

@InputType()
export class AssessmentScoreInput {
  @Field(() => ID) @IsString() studentId!: string;
  @Field(() => Float, { nullable: true }) @IsOptional() @IsNumber() @Min(0) score?: number;
}

@InputType()
export class SaveAssessmentScoresInput {
  @Field(() => ID) @IsString() assessmentId!: string;
  @Field(() => [AssessmentScoreInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => AssessmentScoreInput) scores!: AssessmentScoreInput[];
}

@InputType()
export class SaveGradebookAssessmentInput {
  @Field(() => ID) @IsString() assessmentId!: string;
  @Field(() => [AssessmentScoreInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => AssessmentScoreInput) scores!: AssessmentScoreInput[];
}

@InputType()
export class SaveGradebookScoresInput {
  @Field(() => ID) @IsString() classroomId!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(4) quarter!: number;
  @Field(() => [SaveGradebookAssessmentInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => SaveGradebookAssessmentInput) assessments!: SaveGradebookAssessmentInput[];
}

@InputType()
export class ClassGradingCategoryInput {
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() id?: string;
  @Field() @IsString() @MinLength(1) name!: string;
  @Field(() => Float) @IsNumber() @Min(0.01) @Max(100) weight!: number;
}

@InputType()
export class ConfigureClassGradingInput {
  @Field(() => ID) @IsString() classroomId!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(4) quarter!: number;
  @Field(() => [ClassGradingCategoryInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => ClassGradingCategoryInput) categories!: ClassGradingCategoryInput[];
}
