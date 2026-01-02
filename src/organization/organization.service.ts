import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OrganizationService {
    private readonly logger = new Logger(OrganizationService.name);
    constructor(private readonly prisma: PrismaService) { }

    async getAll() {
        this.logger.log('Fetching all organizations');
        return this.prisma.organization.findMany();
    }
}
