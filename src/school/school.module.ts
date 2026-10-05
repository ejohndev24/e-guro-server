import { Module } from '@nestjs/common';
import { SchoolResolver } from './school.resolver';
import { SchoolService } from './school.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], providers: [SchoolResolver, SchoolService] })
export class SchoolModule {}
