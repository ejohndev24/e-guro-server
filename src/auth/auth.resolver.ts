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
