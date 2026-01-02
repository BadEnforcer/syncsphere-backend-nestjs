import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrganizationService {
    constructor(private readonly prisma: PrismaService) { }

    async getAll() {
        const logger = new Logger(OrganizationService.name);
        logger.log('Fetching all organizations');
        return this.prisma.organization.findMany();
    }
}
