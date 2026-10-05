import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './gql-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'development-only-secret-change-me'),
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  providers: [AuthResolver, AuthService, GqlAuthGuard],
  exports: [AuthService, GqlAuthGuard, JwtModule],
})
export class AuthModule {}
