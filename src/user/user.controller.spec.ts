import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PetService } from '../pet/pet.service';
import { AlertZoneService } from './alert-zone.service';

describe('UserController', () => {
    let controller: UserController;

    const mockUserService = {
        update: jest.fn(),
    };

    const mockPetService = {};
    const mockAlertZoneService = {};

    beforeEach(async () => {
        jest.resetAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                {
                    provide: UserService,
                    useValue: mockUserService,
                },
                {
                    provide: PetService,
                    useValue: mockPetService,
                },
                {
                    provide: AlertZoneService,
                    useValue: mockAlertZoneService,
                },
            ],
        }).compile();

        controller = module.get<UserController>(UserController);
    });

    describe('update', () => {
        it('allows a user to update their own profile', async () => {
            const updatedUser = { id: 2170, firstName: 'Updated' };
            mockUserService.update.mockResolvedValue(updatedUser);

            await expect(
                controller.update(
                    2170,
                    { firstName: 'Updated' },
                    { userId: 2170, roles: [{ slug: 'user' }] },
                ),
            ).resolves.toEqual(updatedUser);

            expect(mockUserService.update).toHaveBeenCalledWith(
                { id: 2170 },
                { firstName: 'Updated' },
            );
        });

        it('allows an admin to update another user', async () => {
            const updatedUser = { id: 2170, firstName: 'Updated' };
            mockUserService.update.mockResolvedValue(updatedUser);

            await expect(
                controller.update(
                    2170,
                    { firstName: 'Updated' },
                    { userId: 1, roles: [{ slug: 'admin' }] },
                ),
            ).resolves.toEqual(updatedUser);
        });

        it('allows a manager to update another user', async () => {
            const updatedUser = { id: 2170, firstName: 'Updated' };
            mockUserService.update.mockResolvedValue(updatedUser);

            await expect(
                controller.update(
                    2170,
                    { firstName: 'Updated' },
                    { userId: 1, roles: [{ slug: 'manager' }] },
                ),
            ).resolves.toEqual(updatedUser);
        });

        it('rejects a non-privileged user updating another profile', async () => {
            await expect(
                controller.update(
                    2170,
                    { firstName: 'Updated' },
                    { userId: 3000, roles: [{ slug: 'user' }] },
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(mockUserService.update).not.toHaveBeenCalled();
        });

        it('rejects a non-privileged user updating their email verification status', async () => {
            await expect(
                controller.update(
                    2170,
                    { emailVerified: true },
                    { userId: 2170, roles: [{ slug: 'user' }] },
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(mockUserService.update).not.toHaveBeenCalled();
        });

        it('allows an admin to update email verification status', async () => {
            const updatedUser = { id: 2170, emailVerified: true };
            mockUserService.update.mockResolvedValue(updatedUser);

            await expect(
                controller.update(
                    2170,
                    { emailVerified: true },
                    { userId: 1, roles: [{ slug: 'admin' }] },
                ),
            ).resolves.toEqual(updatedUser);
        });
    });
});