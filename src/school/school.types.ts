import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { AttendanceStatus } from '@prisma/client';
import { ArrayUnique, IsArray, IsEmail, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

registerEnumType(AttendanceStatus, { name: 'AttendanceStatus' });

@ObjectType()
export class Student {
  @Field(() => ID) id!: string;
  @Field() studentNo!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field() fullName!: string;
  @Field({ nullable: true }) email?: string;
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
}

@ObjectType()
export class Attendance {
  @Field(() => ID) id!: string;
  @Field() date!: Date;
  @Field({ nullable: true }) checkedAt?: Date;
  @Field(() => AttendanceStatus) status!: AttendanceStatus;
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
export class DashboardStats {
  @Field(() => Int) classCount!: number;
  @Field(() => Int) studentCount!: number;
  @Field(() => Float) attendanceRate!: number;
  @Field(() => Int) pendingGrades!: number;
}

@ObjectType()
export class AtRiskStudent {
  @Field(() => Student) student!: Student;
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => Float) currentGrade!: number;
}

@ObjectType()
export class Dashboard {
  @Field() teacherName!: string;
  @Field(() => DashboardStats) stats!: DashboardStats;
  @Field(() => [Classroom]) classes!: Classroom[];
  @Field(() => [AtRiskStudent]) atRisk!: AtRiskStudent[];
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
  @Field() @IsString() @MinLength(1) subject!: string;
  @Field(() => Int) @IsInt() @Min(0) @Max(20) gradeLevel!: number;
  @Field() @IsString() @MinLength(1) section!: string;
  @Field() @IsString() @MinLength(1) room!: string;
  @Field() @IsString() @MinLength(1) scheduleDay!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @Field() @Matches(/^\d{4}-\d{4}$/) schoolYear!: string;
  @Field() @IsString() @MinLength(1) term!: string;
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
  @Field(() => [ID], { defaultValue: [] }) @IsArray() @ArrayUnique() @IsString({ each: true }) classroomIds!: string[];
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
