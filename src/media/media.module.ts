import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { R2Module } from './r2';
import { MediaCleanupModule } from './cleanup';

@Module({
  imports: [R2Module, MediaCleanupModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
