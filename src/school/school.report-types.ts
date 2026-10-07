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
import { ObservedValueRating, SchoolReportKind, SchoolReportStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Classroom, Student } from './school.types';

registerEnumType(ObservedValueRating, { name: 'ObservedValueRating' });
registerEnumType(SchoolReportKind, { name: 'SchoolReportKind' });
registerEnumType(SchoolReportStatus, { name: 'SchoolReportStatus' });

@ObjectType()
export class ReportSchool {
  @Field() name!: string;
  @Field({ nullable: true }) schoolIdNumber?: string;
  @Field({ nullable: true }) region?: string;
  @Field({ nullable: true }) division?: string;
  @Field({ nullable: true }) district?: string;
  @Field({ nullable: true }) address?: string;
  @Field({ nullable: true }) schoolHeadName?: string;
}

@ObjectType()
export class Sf2Row {
  @Field(() => Student) student!: Student;
  @Field(() => [String]) days!: string[];
  @Field(() => Int) present!: number;
  @Field(() => Int) absent!: number;
  @Field(() => Int) late!: number;
  @Field(() => Int) excused!: number;
}

@ObjectType()
export class Sf2Report {
  @Field(() => ReportSchool) school!: ReportSchool;
  @Field(() => Classroom) classroom!: Classroom;
  @Field() adviserName!: string;
  @Field() month!: string;
  @Field(() => SchoolReportStatus) status!: SchoolReportStatus;
  @Field() readyToFinalize!: boolean;
  @Field(() => [String]) missingFields!: string[];
  @Field(() => [Sf2Row]) rows!: Sf2Row[];
}

@ObjectType()
export class Sf9Subject {
  @Field() subject!: string;
  @Field(() => [Float], { nullable: 'items' }) quarters!: Array<number | null>;
  @Field(() => Float, { nullable: true }) finalRating?: number;
  @Field() remarks!: string;
}

@ObjectType()
export class Sf9AttendanceMonth {
  @Field() month!: string;
  @Field(() => Int) schoolDays!: number;
  @Field(() => Int) daysPresent!: number;
  @Field(() => Int) daysAbsent!: number;
  @Field(() => Int) timesLate!: number;
}

@ObjectType()
export class Sf9ObservedValue {
  @Field() coreValue!: string;
  @Field(() => [ObservedValueRating], { nullable: 'items' }) quarters!: Array<ObservedValueRating | null>;
}

@ObjectType()
export class ObservedValueEntry {
  @Field(() => ID) id!: string;
  @Field(() => Int) quarter!: number;
  @Field() coreValue!: string;
  @Field(() => ObservedValueRating) rating!: ObservedValueRating;
}

@ObjectType()
export class Sf9Report {
  @Field(() => ReportSchool) school!: ReportSchool;
  @Field(() => Classroom) classroom!: Classroom;
  @Field(() => Student) student!: Student;
  @Field() adviserName!: string;
  @Field(() => SchoolReportStatus) status!: SchoolReportStatus;
  @Field() variant!: string;
  @Field() readyToFinalize!: boolean;
  @Field(() => [String]) missingFields!: string[];
  @Field(() => [Sf9Subject]) subjects!: Sf9Subject[];
  @Field(() => [Sf9AttendanceMonth]) attendance!: Sf9AttendanceMonth[];
  @Field(() => [Sf9ObservedValue]) observedValues!: Sf9ObservedValue[];
}

@ObjectType()
export class Sf5Row {
  @Field(() => Student) student!: Student;
  @Field(() => Float, { nullable: true }) generalAverage?: number;
  @Field() result!: string;
}

@ObjectType()
export class Sf5Report {
  @Field(() => ReportSchool) school!: ReportSchool;
  @Field(() => Classroom) classroom!: Classroom;
  @Field() adviserName!: string;
  @Field(() => SchoolReportStatus) status!: SchoolReportStatus;
  @Field() variant!: string;
  @Field() readyToFinalize!: boolean;
  @Field(() => [String]) missingFields!: string[];
  @Field(() => [Sf5Row]) rows!: Sf5Row[];
}

@ObjectType()
export class ReportStatusPayload {
  @Field(() => ID) id!: string;
  @Field(() => SchoolReportKind) kind!: SchoolReportKind;
  @Field(() => SchoolReportStatus) status!: SchoolReportStatus;
  @Field() periodKey!: string;
  @Field({ nullable: true }) finalizedAt?: Date;
  @Field({ nullable: true }) lockedAt?: Date;
}

@InputType()
export class SaveObservedValueInput {
  @Field(() => ID) @IsString() classroomId!: string;
  @Field(() => ID) @IsString() studentId!: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(4) quarter!: number;
  @Field() @IsString() coreValue!: string;
  @Field(() => ObservedValueRating) @IsEnum(ObservedValueRating) rating!: ObservedValueRating;
}

@InputType()
export class UpdateSchoolProfileInput {
  @Field({ nullable: true }) @IsOptional() @IsString() schoolIdNumber?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() region?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() division?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() district?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() address?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() schoolHeadName?: string;
}
