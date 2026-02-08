import { Reflector } from '@nestjs/core';
import {
    MinUserLevel,
    MIN_USER_LEVEL_KEY,
} from '../min-user-level.decorator';

describe('MinUserLevel Decorator', () => {
    let reflector: Reflector;

    beforeEach(() => {
        reflector = new Reflector();
    });

    it('should set metadata with the correct key', () => {
        class TestController {
            @MinUserLevel(50)
            testMethod() { }
        }

        const metadata = reflector.get(
            MIN_USER_LEVEL_KEY,
            TestController.prototype.testMethod,
        );

        expect(metadata).toBe(50);
    });

    it('should store the provided level value', () => {
        class TestController {
            @MinUserLevel(10)
            adminMethod() { }

            @MinUserLevel(100)
            userMethod() { }
        }

        const adminMetadata = reflector.get(
            MIN_USER_LEVEL_KEY,
            TestController.prototype.adminMethod,
        );
        const userMetadata = reflector.get(
            MIN_USER_LEVEL_KEY,
            TestController.prototype.userMethod,
        );

        expect(adminMetadata).toBe(10);
        expect(userMetadata).toBe(100);
    });

    it('should work on class level', () => {
        @MinUserLevel(50)
        class TestController { }

        const metadata = reflector.get(MIN_USER_LEVEL_KEY, TestController);

        expect(metadata).toBe(50);
    });

    it('should be retrievable via Reflector', () => {
        const level = 75;

        @MinUserLevel(level)
        class TestController {
            @MinUserLevel(level)
            testMethod() { }
        }

        const classMetadata = reflector.get(MIN_USER_LEVEL_KEY, TestController);
        const methodMetadata = reflector.get(
            MIN_USER_LEVEL_KEY,
            TestController.prototype.testMethod,
        );

        expect(classMetadata).toBe(level);
        expect(methodMetadata).toBe(level);
    });

    it('should handle zero as a valid level', () => {
        class TestController {
            @MinUserLevel(0)
            superAdminMethod() { }
        }

        const metadata = reflector.get(
            MIN_USER_LEVEL_KEY,
            TestController.prototype.superAdminMethod,
        );

        expect(metadata).toBe(0);
    });
});
