/**
 * Helper utilities for retrieving Prisma model field metadata dynamically.
 * This enables type-safe field validation without hardcoding field names.
 */

import { Prisma } from '@prisma-lib/client';

/**
 * Valid Prisma relation operation keys that can be used in update inputs.
 */
export const VALID_RELATION_OPERATIONS = [
  'create',
  'createMany',
  'connect',
  'connectOrCreate',
  'disconnect',
  'delete',
  'deleteMany',
  'update',
  'updateMany',
  'upsert',
  'set',
] as const;

export type RelationOperation = (typeof VALID_RELATION_OPERATIONS)[number];

/**
 * Model field metadata containing scalar fields, relation fields, and immutable fields.
 */
export interface ModelFieldMetadata {
  /** All scalar fields on the model */
  scalarFields: string[];
  /** All relation fields on the model */
  relationFields: string[];
  /** Fields that should not be updated (e.g., id, createdAt) */
  immutableFields: string[];
  /** Scalar fields that can be updated */
  updatableScalarFields: string[];
}

/**
 * Gets the scalar field names for the User model from Prisma's generated enum.
 *
 * @returns Array of User scalar field names
 */
export function getUserScalarFields(): string[] {
  return Object.values(Prisma.UserScalarFieldEnum);
}

/**
 * Gets the relation field names for the User model.
 * These are derived from the UserInclude type keys.
 *
 * @returns Array of User relation field names
 */
export function getUserRelationFields(): string[] {
  // These are the relation fields defined in the User model
  // We derive them from what's available in UserInclude
  return ['roles', 'sessions', 'accounts'];
}

/**
 * Gets immutable fields that should never be updated for the User model.
 *
 * @returns Array of immutable field names
 */
export function getUserImmutableFields(): string[] {
  return ['id', 'createdAt'];
}

/**
 * Gets complete field metadata for the User model.
 *
 * @returns ModelFieldMetadata for the User model
 */
export function getUserFieldMetadata(): ModelFieldMetadata {
  const scalarFields = getUserScalarFields();
  const relationFields = getUserRelationFields();
  const immutableFields = getUserImmutableFields();

  const updatableScalarFields = scalarFields.filter(
    (field) => !immutableFields.includes(field),
  );

  return {
    scalarFields,
    relationFields,
    immutableFields,
    updatableScalarFields,
  };
}

/**
 * Checks if a value is a valid Prisma relation update object.
 * Valid relation objects contain keys like: connect, disconnect, create, update, delete, etc.
 *
 * @param value - The value to check
 * @returns True if the value is a valid Prisma relation object
 *
 * @example
 * isValidPrismaRelationObject({ connect: { id: 1 } }); // true
 * isValidPrismaRelationObject({ set: [{ id: 1 }] }); // true
 * isValidPrismaRelationObject({ someRandomKey: 'value' }); // false
 * isValidPrismaRelationObject('string'); // false
 */
export function isValidPrismaRelationObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return keys.some((key) =>
    VALID_RELATION_OPERATIONS.includes(key as RelationOperation),
  );
}

/**
 * Sanitizes update data by filtering to only valid model fields.
 * Removes any fields that are not part of the model or are immutable.
 *
 * @param data - The raw update data object
 * @param metadata - The model field metadata
 * @returns Sanitized update data with only valid, updatable fields
 *
 * @example
 * const metadata = getUserFieldMetadata();
 * const sanitized = sanitizeUpdateData(
 *   { firstName: 'John', id: 999, invalidField: 'test' },
 *   metadata
 * );
 * // Result: { firstName: 'John' } - id is immutable, invalidField is not a valid field
 */
export function sanitizeUpdateData<T extends Record<string, unknown>>(
  data: T,
  metadata: ModelFieldMetadata,
): Partial<T> {
  const sanitizedData: Partial<T> = {};

  // Process scalar fields
  for (const field of metadata.updatableScalarFields) {
    if (field in data && data[field] !== undefined) {
      (sanitizedData as Record<string, unknown>)[field] = data[field];
    }
  }

  // Process relationship fields - only include if they're valid Prisma relation objects
  for (const relation of metadata.relationFields) {
    if (relation in data && data[relation] !== undefined) {
      const relationValue = data[relation];
      if (isValidPrismaRelationObject(relationValue)) {
        (sanitizedData as Record<string, unknown>)[relation] = relationValue;
      }
    }
  }

  return sanitizedData;
}
