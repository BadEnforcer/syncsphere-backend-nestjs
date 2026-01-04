import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { R2Service } from './r2.service';

/**
 * Module providing Cloudflare R2 storage integration.
 * Marked as global so R2Service can be injected anywhere without explicit imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [R2Service],
  exports: [R2Service],
})
export class R2Module {}
