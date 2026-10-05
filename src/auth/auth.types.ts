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
