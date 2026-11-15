import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { LearningController } from './learning.controller.js';
import { LearningService } from './learning.service.js';

@Module({
  imports: [MediaModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}