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
import { EducationLevel, GradingSchemeStatus, LearnerSex, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { AuthUser } from '../auth/auth.types';

registerEnumType(EducationLevel, { name: 'EducationLevel' });
registerEnumType(GradingSchemeStatus, { name: 'GradingSchemeStatus' });
registerEnumType(LearnerSex, { name: 'LearnerSex' });

@ObjectType()
export class SchoolSummary {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() code!: string;
  @Field(() => Int) teacherCount!: number;
  @Field(() => Int) studentCount!: number;
  @Field(() => Int) classCount!: number;
  @Field() createdAt!: Date;
  @Field({ nullable: true }) schoolIdNumber?: string;
  @Field({ nullable: true }) region?: string;
  @Field({ nullable: true }) division?: string;
  @Field({ nullable: true }) district?: string;
  @Field({ nullable: true }) address?: string;
  @Field({ nullable: true }) schoolHeadName?: string;
}

@ObjectType()
export class SchoolDetail {
  @Field(() => SchoolSummary) school!: SchoolSummary;
  @Field(() => [AuthUser]) users!: AuthUser[];
}

@InputType()
export class CreateSchoolInput {
  @Field() @IsString() @MinLength(2) name!: string;
  @Field() @IsString() @Length(2, 12) code!: string;
  @Field() @IsString() @MinLength(2) adminName!: string;
  @Field() @IsEmail() adminEmail!: string;
}

@InputType()
export class InviteTeacherInput {
  @Field(() => ID) @IsString() schoolId!: string;
  @Field() @IsString() @MinLength(2) name!: string;
  @Field() @IsEmail() email!: string;
}

@ObjectType()
export class InvitationPayload {
  @Field(() => AuthUser) user!: AuthUser;
  @Field() emailSent!: boolean;
}

@ObjectType()
export class AdminClassroom {
  @Field(() => ID) id!: string;
  @Field() subject!: string;
  @Field(() => Int) gradeLevel!: number;
  @Field() section!: string;
  @Field() room!: string;
  @Field() scheduleDay!: string;
  @Field() startTime!: string;
  @Field() endTime!: string;
  @Field() schoolYear!: string;
  @Field() term!: string;
  @Field(() => ID) teacherId!: string;
  @Field() teacherName!: string;
  @Field(() => ID, { nullable: true }) gradingSchemeId?: string;
  @Field({ nullable: true }) gradingSchemeName?: string;
  @Field(() => Int) studentCount!: number;
  @Field(() => EducationLevel) educationLevel!: EducationLevel;
  @Field() isAdvisory!: boolean;
}

@InputType()
export class SaveClassroomInput {
  @Field(() => ID) @IsString() schoolId!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() id?: string;
  @Field() @IsString() @MinLength(1) subject!: string;
  @Field(() => Int) @IsInt() @Min(0) @Max(20) gradeLevel!: number;
  @Field() @IsString() @MinLength(1) section!: string;
  @Field() @IsString() @MinLength(1) room!: string;
  @Field() @IsString() @MinLength(1) scheduleDay!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Field() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @Field() @Matches(/^\d{4}-\d{4}$/) schoolYear!: string;
  @Field() @IsString() @MinLength(1) term!: string;
  @Field(() => ID) @IsString() teacherId!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() gradingSchemeId?: string;
  @Field(() => EducationLevel) @IsEnum(EducationLevel) educationLevel!: EducationLevel;
  @Field({ defaultValue: false }) @IsBoolean() isAdvisory!: boolean;
}

@ObjectType()
export class AdminStudent {
  @Field(() => ID) id!: string;
  @Field() studentNo!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) lrn?: string;
  @Field({ nullable: true }) birthDate?: Date;
  @Field(() => LearnerSex, { nullable: true }) sex?: LearnerSex;
  @Field(() => [AdminClassroom]) classes!: AdminClassroom[];
  @Field() createdAt!: Date;
}

@InputType()
export class SaveStudentInput {
  @Field(() => ID) @IsString() schoolId!: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsString() id?: string;
  @Field() @IsString() @MinLength(1) studentNo!: string;
  @Field() @IsString() @MinLength(1) firstName!: string;
  @Field() @IsString() @MinLength(1) lastName!: string;
  @Field({ nullable: true }) @IsOptional() @IsEmail() email?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() lrn?: string;
  @Field({ nullable: true }) @IsOptional() @IsDateString() birthDate?: string;
  @Field(() => LearnerSex, { nullable: true }) @IsOptional() @IsEnum(LearnerSex) sex?: LearnerSex;
  @Field(() => [ID]) @IsArray() @ArrayUnique() @IsString({ each: true }) classroomIds!: string[];
}

@InputType()
export class GradeCategoryInput {
  @Field() @IsString() @MinLength(1) name!: string;
  @Field(() => Float) @IsNumber() @Min(0.01) @Max(100) weight!: number;
}

@InputType()
export class CreateGradingSchemeInput {
  @Field(() => ID) @IsString() schoolId!: string;
  @Field() @IsString() @MinLength(2) name!: string;
  @Field(() => EducationLevel) @IsEnum(EducationLevel) educationLevel!: EducationLevel;
  @Field(() => [GradeCategoryInput]) @IsArray() @ValidateNested({ each: true }) @Type(() => GradeCategoryInput) categories!: GradeCategoryInput[];
  @Field(() => [ID], { defaultValue: [] }) @IsArray() @ArrayUnique() @IsString({ each: true }) classroomIds!: string[];
}

@ObjectType()
export class GradeCategoryView {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => Float) weight!: number;
  @Field(() => Int) position!: number;
}

@ObjectType()
export class GradingSchemeView {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field(() => EducationLevel) educationLevel!: EducationLevel;
  @Field(() => GradingSchemeStatus) status!: GradingSchemeStatus;
  @Field(() => Int) version!: number;
  @Field(() => Float) totalWeight!: number;
  @Field(() => [GradeCategoryView]) categories!: GradeCategoryView[];
  @Field(() => [AdminClassroom]) classes!: AdminClassroom[];
}
