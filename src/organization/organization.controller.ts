import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CacheInterceptor, CacheKey } from '@nestjs/cache-manager';

@Controller('organization')
export class OrganizationController {

    constructor(private readonly orgService: OrganizationService) { }

    @CacheKey('organizations')
    @UseInterceptors(CacheInterceptor)
    @Get()
    async getAll() {
        return this.orgService.getAll();
    }
    
}
