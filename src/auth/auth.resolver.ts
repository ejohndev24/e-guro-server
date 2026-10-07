/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthPayload, AuthUser, JwtUser, RegisterTeacherInput } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { GqlAuthGuard } from './gql-auth.guard';

@Resolver()
export class AuthResolver {
  constructor(private readonly auth: AuthService) {}

  @Mutation(() => AuthPayload)
  login(
    @Args('email') email: string,
    @Args('password') password: string,
  ) {
    return this.auth.login(email, password);
  }

  @Mutation(() => AuthPayload)
  registerTeacher(@Args('input') input: RegisterTeacherInput) {
    return this.auth.registerTeacher(input);
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => AuthUser)
  me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user.sub);
  }

  @UseGuards(GqlAuthGuard)
  @Mutation(() => AuthUser)
  changePassword(
    @CurrentUser() user: JwtUser,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ) {
    return this.auth.changePassword(user.sub, currentPassword, newPassword);
  }
}
