import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ClientKeyGuard } from '../client-key.guard';

describe('ClientKeyGuard', () => {
    let guard: ClientKeyGuard;
    let reflector: { getAllAndOverride: jest.Mock };
    const originalEnv = process.env.CLIENT_API_KEYS;

    beforeEach(async () => {
        process.env.CLIENT_API_KEYS = 'key-one, key-two';
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClientKeyGuard,
                { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
            ],
        }).compile();

        guard = module.get<ClientKeyGuard>(ClientKeyGuard);
        reflector = module.get(Reflector);
    });

    afterEach(() => {
        jest.clearAllMocks();
        if (originalEnv === undefined) {
            delete process.env.CLIENT_API_KEYS;
        } else {
            process.env.CLIENT_API_KEYS = originalEnv;
        }
    });

    const createMockContext = (headers: Record<string, string> = {}): ExecutionContext =>
        ({
            switchToHttp: () => ({ getRequest: () => ({ headers }) }),
            getHandler: () => jest.fn(),
            getClass: () => class MockController { },
        }) as any;

    it('allows access when the route does not require a client key', () => {
        reflector.getAllAndOverride.mockReturnValue(undefined);
        expect(guard.canActivate(createMockContext())).toBe(true);
    });

    it('allows access with a valid client key', () => {
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(guard.canActivate(createMockContext({ 'x-client-key': 'key-one' }))).toBe(true);
    });

    it('accepts any key from the configured list', () => {
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(guard.canActivate(createMockContext({ 'x-client-key': 'key-two' }))).toBe(true);
    });

    it('rejects a wrong client key', () => {
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(() => guard.canActivate(createMockContext({ 'x-client-key': 'nope' })))
            .toThrow(UnauthorizedException);
    });

    it('rejects a key that differs only in length', () => {
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(() => guard.canActivate(createMockContext({ 'x-client-key': 'key-on' })))
            .toThrow(UnauthorizedException);
    });

    it('rejects when the header is missing', () => {
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(() => guard.canActivate(createMockContext())).toThrow(UnauthorizedException);
    });

    it('fails closed when CLIENT_API_KEYS is not configured', () => {
        delete process.env.CLIENT_API_KEYS;
        reflector.getAllAndOverride.mockReturnValue(true);
        expect(() => guard.canActivate(createMockContext({ 'x-client-key': 'key-one' })))
            .toThrow(UnauthorizedException);
    });
});
