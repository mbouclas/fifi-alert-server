import { Prisma } from '@prisma-lib/client';
import {
  getUserScalarFields,
  getUserRelationFields,
  getUserImmutableFields,
  getUserFieldMetadata,
  isValidPrismaRelationObject,
  sanitizeUpdateData,
  VALID_RELATION_OPERATIONS,
} from './prisma-model-fields.helper';

describe('prisma-model-fields.helper', () => {
  describe('getUserScalarFields', () => {
    it('should return all scalar fields from Prisma UserScalarFieldEnum', () => {
      const fields = getUserScalarFields();

      expect(fields).toContain('id');
      expect(fields).toContain('name');
      expect(fields).toContain('firstName');
      expect(fields).toContain('lastName');
      expect(fields).toContain('email');
      expect(fields).toContain('emailVerified');
      expect(fields).toContain('image');
      expect(fields).toContain('createdAt');
      expect(fields).toContain('updatedAt');
      expect(fields).toContain('settings');
      expect(fields).toContain('meta');
    });

    it('should match Prisma.UserScalarFieldEnum values', () => {
      const fields = getUserScalarFields();
      const prismaFields = Object.values(Prisma.UserScalarFieldEnum);

      expect(fields).toEqual(prismaFields);
    });
  });

  describe('getUserRelationFields', () => {
    it('should return all relation fields for User model', () => {
      const fields = getUserRelationFields();

      expect(fields).toContain('roles');
      expect(fields).toContain('sessions');
      expect(fields).toContain('accounts');
      expect(fields).toHaveLength(3);
    });
  });

  describe('getUserImmutableFields', () => {
    it('should return immutable fields that should not be updated', () => {
      const fields = getUserImmutableFields();

      expect(fields).toContain('id');
      expect(fields).toContain('createdAt');
      expect(fields).toHaveLength(2);
    });
  });

  describe('getUserFieldMetadata', () => {
    it('should return complete field metadata', () => {
      const metadata = getUserFieldMetadata();

      expect(metadata.scalarFields).toBeDefined();
      expect(metadata.relationFields).toBeDefined();
      expect(metadata.immutableFields).toBeDefined();
      expect(metadata.updatableScalarFields).toBeDefined();
    });

    it('should exclude immutable fields from updatable scalar fields', () => {
      const metadata = getUserFieldMetadata();

      expect(metadata.updatableScalarFields).not.toContain('id');
      expect(metadata.updatableScalarFields).not.toContain('createdAt');
    });

    it('should include updatable fields in updatableScalarFields', () => {
      const metadata = getUserFieldMetadata();

      expect(metadata.updatableScalarFields).toContain('firstName');
      expect(metadata.updatableScalarFields).toContain('lastName');
      expect(metadata.updatableScalarFields).toContain('email');
      expect(metadata.updatableScalarFields).toContain('emailVerified');
      expect(metadata.updatableScalarFields).toContain('image');
      expect(metadata.updatableScalarFields).toContain('settings');
      expect(metadata.updatableScalarFields).toContain('meta');
    });
  });

  describe('isValidPrismaRelationObject', () => {
    it('should return true for valid relation objects with connect', () => {
      expect(isValidPrismaRelationObject({ connect: { id: 1 } })).toBe(true);
    });

    it('should return true for valid relation objects with disconnect', () => {
      expect(isValidPrismaRelationObject({ disconnect: true })).toBe(true);
    });

    it('should return true for valid relation objects with create', () => {
      expect(isValidPrismaRelationObject({ create: { name: 'test' } })).toBe(
        true,
      );
    });

    it('should return true for valid relation objects with set', () => {
      expect(isValidPrismaRelationObject({ set: [{ id: 1 }] })).toBe(true);
    });

    it('should return true for valid relation objects with update', () => {
      expect(
        isValidPrismaRelationObject({ update: { where: { id: 1 }, data: {} } }),
      ).toBe(true);
    });

    it('should return true for valid relation objects with delete', () => {
      expect(isValidPrismaRelationObject({ delete: { id: 1 } })).toBe(true);
    });

    it('should return false for non-object values', () => {
      expect(isValidPrismaRelationObject('string')).toBe(false);
      expect(isValidPrismaRelationObject(123)).toBe(false);
      expect(isValidPrismaRelationObject(null)).toBe(false);
      expect(isValidPrismaRelationObject(undefined)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isValidPrismaRelationObject([{ id: 1 }])).toBe(false);
    });

    it('should return false for objects without valid relation keys', () => {
      expect(isValidPrismaRelationObject({ invalidKey: 'value' })).toBe(false);
      expect(isValidPrismaRelationObject({ someField: { nested: true } })).toBe(
        false,
      );
    });

    it('should return false for empty objects', () => {
      expect(isValidPrismaRelationObject({})).toBe(false);
    });
  });

  describe('sanitizeUpdateData', () => {
    const metadata = getUserFieldMetadata();

    it('should keep valid updatable scalar fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toEqual(data);
    });

    it('should remove immutable fields like id and createdAt', () => {
      const data = {
        id: 999,
        createdAt: new Date(),
        firstName: 'John',
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).not.toHaveProperty('id');
      expect(result).not.toHaveProperty('createdAt');
      expect(result).toHaveProperty('firstName', 'John');
    });

    it('should remove fields that are not part of the model', () => {
      const data = {
        firstName: 'John',
        invalidField: 'test',
        anotherInvalid: 123,
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toHaveProperty('firstName', 'John');
      expect(result).not.toHaveProperty('invalidField');
      expect(result).not.toHaveProperty('anotherInvalid');
    });

    it('should include valid Prisma relation objects', () => {
      const data = {
        firstName: 'John',
        roles: { connect: [{ id: 1 }] },
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toHaveProperty('firstName', 'John');
      expect(result).toHaveProperty('roles');
      expect((result as Record<string, unknown>).roles).toEqual({
        connect: [{ id: 1 }],
      });
    });

    it('should exclude invalid relation values (non-Prisma objects)', () => {
      const data = {
        firstName: 'John',
        roles: [{ id: 1 }], // Array, not a valid Prisma relation object
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toHaveProperty('firstName', 'John');
      expect(result).not.toHaveProperty('roles');
    });

    it('should exclude relation fields without valid operation keys', () => {
      const data = {
        firstName: 'John',
        roles: { someInvalidKey: [{ id: 1 }] },
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toHaveProperty('firstName', 'John');
      expect(result).not.toHaveProperty('roles');
    });

    it('should handle undefined values by excluding them', () => {
      const data = {
        firstName: 'John',
        lastName: undefined,
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toHaveProperty('firstName', 'John');
      expect(result).not.toHaveProperty('lastName');
    });

    it('should return empty object when no valid fields provided', () => {
      const data = {
        invalidField1: 'test',
        invalidField2: 123,
      };

      const result = sanitizeUpdateData(data, metadata);

      expect(result).toEqual({});
    });
  });

  describe('VALID_RELATION_OPERATIONS', () => {
    it('should contain all standard Prisma relation operations', () => {
      expect(VALID_RELATION_OPERATIONS).toContain('create');
      expect(VALID_RELATION_OPERATIONS).toContain('createMany');
      expect(VALID_RELATION_OPERATIONS).toContain('connect');
      expect(VALID_RELATION_OPERATIONS).toContain('connectOrCreate');
      expect(VALID_RELATION_OPERATIONS).toContain('disconnect');
      expect(VALID_RELATION_OPERATIONS).toContain('delete');
      expect(VALID_RELATION_OPERATIONS).toContain('deleteMany');
      expect(VALID_RELATION_OPERATIONS).toContain('update');
      expect(VALID_RELATION_OPERATIONS).toContain('updateMany');
      expect(VALID_RELATION_OPERATIONS).toContain('upsert');
      expect(VALID_RELATION_OPERATIONS).toContain('set');
    });
  });
});
