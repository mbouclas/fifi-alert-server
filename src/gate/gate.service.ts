import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../services/prisma.service';
import { CreateGateDto, UpdateGateDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class GateService {
    private readonly logger = new Logger(GateService.name);

    constructor(private readonly prisma: PrismaService) { }

    /**
     * Create a new gate
     */
    async create(createGateDto: CreateGateDto) {
        // Check if gate with this name already exists
        const existingGate = await this.prisma.gate.findUnique({
            where: { name: createGateDto.name },
        });

        if (existingGate) {
            throw new ConflictException(`Gate with name "${createGateDto.name}" already exists`);
        }

        const gate = await this.prisma.gate.create({
            data: createGateDto,
        });

        this.logger.log(`Gate created: ${gate.name}`);
        return gate;
    }

    /**
     * Get all gates
     */
    async findAll() {
        return this.prisma.gate.findMany({
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get a single gate by ID
     */
    async findOne(id: number) {
        const gate = await this.prisma.gate.findUnique({
            where: { id },
        });

        if (!gate) {
            throw new NotFoundException(`Gate with ID ${id} not found`);
        }

        return gate;
    }

    /**
     * Update a gate
     */
    async update(id: number, updateGateDto: UpdateGateDto) {
        // Check if gate exists
        await this.findOne(id);

        // If updating name, check for conflicts
        if (updateGateDto.name) {
            const existingGate = await this.prisma.gate.findFirst({
                where: {
                    name: updateGateDto.name,
                    NOT: { id },
                },
            });

            if (existingGate) {
                throw new ConflictException(`Gate with name "${updateGateDto.name}" already exists`);
            }
        }

        const gate = await this.prisma.gate.update({
            where: { id },
            data: updateGateDto,
        });

        this.logger.log(`Gate updated: ${gate.name}`);
        return gate;
    }

    /**
     * Delete a gate
     */
    async remove(id: number) {
        // Check if gate exists
        await this.findOne(id);

        // Delete all user-gate associations first
        await this.prisma.userGate.deleteMany({
            where: { gateId: id },
        });

        const gate = await this.prisma.gate.delete({
            where: { id },
        });

        this.logger.log(`Gate deleted: ${gate.name}`);
        return gate;
    }

    /**
     * Get users who have a specific gate
     */
    async getUsersWithGate(gateId: number) {
        const gate = await this.findOne(gateId);

        const userGates = await this.prisma.userGate.findMany({
            where: { gateId },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        createdAt: true,
                    },
                },
            },
        });

        return {
            gate,
            users: userGates.map(ug => ug.user),
            count: userGates.length,
        };
    }
}
