import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { RequiredAuthGuard, OptionalAuthGuard } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UseGuards(RequiredAuthGuard)
  @Get('/test')
    test(@Request() req) {
    return req['user'];
    }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
