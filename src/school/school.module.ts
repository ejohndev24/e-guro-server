/*
 * Copyright (c) Emil John Benitez, 2026. All rights reserved. This computer
 * program is protected by copyright laws  and international treaties, and it
 * or any part thereof, may not be copied,  reproduced, utilized, distributed
 * or an adaptation thereof be made,  without the prior authority and consent
 * of PharmaServ Express.  Any unauthorized use of this program will be dealt
 * with and  prosecuted to the maximum extent possible under  the law and may
 * result in civil and criminal liabilities.
 */
import { Module } from '@nestjs/common';
import { SchoolResolver } from './school.resolver';
import { SchoolService } from './school.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], providers: [SchoolResolver, SchoolService] })
export class SchoolModule {}
