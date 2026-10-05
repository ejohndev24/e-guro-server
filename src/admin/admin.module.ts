import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminResolver } from './admin.resolver';
import { AdminService } from './admin.service';
import { MailService } from './mail.service';
import { RolesGuard } from './roles.guard';

@Module({ imports: [AuthModule], providers: [AdminResolver, AdminService, MailService, RolesGuard] })
export class AdminModule {}
