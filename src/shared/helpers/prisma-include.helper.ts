/**
 * Helper utilities for building Prisma include objects dynamically.
 * These helpers enable uniform relationship loading across all services.
 */

/**
 * Configuration for nested includes on junction tables or relationships
 * that require deeper fetching.
 *
 * @example
 * const config: NestedIncludeConfig = {
 *   roles: {
 *     include: {
 *       role: true,
 *     },
 *   },
 *   permissions: {
 *     include: {
 *       permission: true,
 *     },
 *   },
 * };
 */
export type NestedIncludeConfig = Record<string, object>;

/**
 * Global nested include configurations for common junction tables.
 * Add new entries here as new junction tables are created in the schema.
 */
export const GLOBAL_NESTED_INCLUDES: NestedIncludeConfig = {
  // UserRole junction table - include the actual Role data
  roles: {
    include: {
      role: true,
    },
  },
  // UserGate junction table - include the actual Gate data
  gates: {
    include: {
      gate: true,
    },
  },
};

/**
 * Builds a Prisma include object from an array of relationship names.
 * Supports nested includes for junction tables (e.g., 'roles' includes the nested 'role' relation).
 *
 * @param includes - Array of relationship names to include
 * @param nestedIncludes - Optional custom nested include configuration. Defaults to GLOBAL_NESTED_INCLUDES.
 * @returns Prisma-compatible include object
 *
 * @example
 * // Simple usage with global config
 * const includeObject = buildIncludeObject(['roles', 'sessions']);
 * // Result: { roles: { include: { role: true } }, sessions: true }
 *
 * @example
 * // With custom nested includes
 * const customConfig = {
 *   members: { include: { user: true } },
 * };
 * const includeObject = buildIncludeObject(['members'], customConfig);
 * // Result: { members: { include: { user: true } } }
 *
 * @example
 * // Merging global and custom config
 * const customConfig = {
 *   ...GLOBAL_NESTED_INCLUDES,
 *   customRelation: { include: { nested: true } },
 * };
 * const includeObject = buildIncludeObject(['roles', 'customRelation'], customConfig);
 */
export function buildIncludeObject<T = Record<string, boolean | object>>(
  includes: string[],
  nestedIncludes: NestedIncludeConfig = GLOBAL_NESTED_INCLUDES,
): T {
  if (includes.length === 0) {
    return {} as T;
  }

  const includeObject: Record<string, boolean | object> = {};

  for (const relation of includes) {
    if (relation in nestedIncludes) {
      // Use predefined nested include for junction tables
      includeObject[relation] = nestedIncludes[relation];
    } else {
      // Simple include for direct relationships
      includeObject[relation] = true;
    }
  }

  return includeObject as T;
}

/**
 * Creates a Prisma query options object with an include clause if relationships are specified.
 * Useful for conditionally adding includes to findUnique, findFirst, findMany, etc.
 *
 * @param where - The Prisma where clause
 * @param includes - Array of relationship names to include
 * @param nestedIncludes - Optional custom nested include configuration
 * @returns Prisma query options with where and optional include
 *
 * @example
 * const options = buildQueryOptions({ id: 1 }, ['roles']);
 * const user = await prisma.user.findUnique(options);
 *
 * @example
 * const options = buildQueryOptions({ email: 'test@example.com' }, []);
 * // Result: { where: { email: 'test@example.com' } } - no include property
 */
export function buildQueryOptions<TWhere>(
  where: TWhere,
  includes: string[],
  nestedIncludes: NestedIncludeConfig = GLOBAL_NESTED_INCLUDES,
): { where: TWhere; include?: Record<string, boolean | object> } {
  const includeObject = buildIncludeObject(includes, nestedIncludes);

  return {
    where,
    ...(Object.keys(includeObject).length > 0 && { include: includeObject }),
  };
}
