import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [AuthModule, MediaModule, PaymentsModule],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}