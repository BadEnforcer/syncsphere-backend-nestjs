import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { RequiredAuthGuard } from './auth/auth.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @UseGuards(RequiredAuthGuard)
  @Get('/test')
  test(@Request() req) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-member-access
    return req['user'];
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
