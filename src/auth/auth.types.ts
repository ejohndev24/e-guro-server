/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Field, ID, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { UserRole } from '@prisma/client';
import { IsEmail, IsString, MinLength } from 'class-validator';

registerEnumType(UserRole, { name: 'UserRole' });

@ObjectType()
export class AuthUser {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() email!: string;
  @Field(() => UserRole) role!: UserRole;
  @Field(() => ID, { nullable: true }) schoolId?: string;
  @Field() mustChangePassword!: boolean;
  @Field() isIndependent!: boolean;
}

@InputType()
export class RegisterTeacherInput {
  @Field() @IsString() @MinLength(2) name!: string;
  @Field() @IsEmail() email!: string;
  @Field() @IsString() @MinLength(10) password!: string;
}

@ObjectType()
export class AuthPayload {
  @Field() accessToken!: string;
  @Field(() => AuthUser) user!: AuthUser;
}

export type JwtUser = {
  sub: string;
  email: string;
  role: UserRole;
  schoolId?: string;
};
