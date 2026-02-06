import {
  buildIncludeObject,
  buildQueryOptions,
  GLOBAL_NESTED_INCLUDES,
  NestedIncludeConfig,
} from './prisma-include.helper';

describe('prisma-include.helper', () => {
  describe('buildIncludeObject', () => {
    it('should return empty object when includes array is empty', () => {
      const result = buildIncludeObject([]);

      expect(result).toEqual({});
    });

    it('should return simple include for non-nested relationships', () => {
      const result = buildIncludeObject(['sessions']);

      expect(result).toEqual({ sessions: true });
    });

    it('should return nested include for roles (from global config)', () => {
      const result = buildIncludeObject(['roles']);

      expect(result).toEqual({
        roles: {
          include: {
            role: true,
          },
        },
      });
    });

    it('should handle multiple relationships', () => {
      const result = buildIncludeObject(['roles', 'sessions', 'accounts']);

      expect(result).toEqual({
        roles: {
          include: {
            role: true,
          },
        },
        sessions: true,
        accounts: true,
      });
    });

    it('should use custom nested includes when provided', () => {
      const customConfig: NestedIncludeConfig = {
        members: {
          include: {
            user: true,
          },
        },
      };

      const result = buildIncludeObject(['members'], customConfig);

      expect(result).toEqual({
        members: {
          include: {
            user: true,
          },
        },
      });
    });

    it('should merge global and custom nested includes', () => {
      const customConfig: NestedIncludeConfig = {
        ...GLOBAL_NESTED_INCLUDES,
        permissions: {
          include: {
            permission: true,
          },
        },
      };

      const result = buildIncludeObject(
        ['roles', 'permissions', 'sessions'],
        customConfig,
      );

      expect(result).toEqual({
        roles: {
          include: {
            role: true,
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
        sessions: true,
      });
    });

    it('should override global config with custom config', () => {
      const customConfig: NestedIncludeConfig = {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      };

      const result = buildIncludeObject(['roles'], customConfig);

      expect(result).toEqual({
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      });
    });

    it('should handle unknown relationship names as simple includes', () => {
      const result = buildIncludeObject(['unknownRelation', 'anotherUnknown']);

      expect(result).toEqual({
        unknownRelation: true,
        anotherUnknown: true,
      });
    });
  });

  describe('buildQueryOptions', () => {
    it('should return only where clause when includes is empty', () => {
      const result = buildQueryOptions({ id: 1 }, []);

      expect(result).toEqual({
        where: { id: 1 },
      });
    });

    it('should return where and include when includes is provided', () => {
      const result = buildQueryOptions({ id: 1 }, ['roles']);

      expect(result).toEqual({
        where: { id: 1 },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      });
    });

    it('should handle complex where clauses', () => {
      const where = {
        email: 'test@example.com',
        emailVerified: true,
      };

      const result = buildQueryOptions(where, ['sessions']);

      expect(result).toEqual({
        where: {
          email: 'test@example.com',
          emailVerified: true,
        },
        include: {
          sessions: true,
        },
      });
    });

    it('should use custom nested includes', () => {
      const customConfig: NestedIncludeConfig = {
        posts: {
          include: {
            author: true,
            comments: true,
          },
        },
      };

      const result = buildQueryOptions({ id: 1 }, ['posts'], customConfig);

      expect(result).toEqual({
        where: { id: 1 },
        include: {
          posts: {
            include: {
              author: true,
              comments: true,
            },
          },
        },
      });
    });

    it('should not include "include" property when result is empty object', () => {
      const result = buildQueryOptions({ id: 1 }, []);

      expect(result).not.toHaveProperty('include');
      expect(Object.keys(result)).toEqual(['where']);
    });
  });

  describe('GLOBAL_NESTED_INCLUDES', () => {
    it('should have roles configuration', () => {
      expect(GLOBAL_NESTED_INCLUDES).toHaveProperty('roles');
      expect(GLOBAL_NESTED_INCLUDES.roles).toEqual({
        include: {
          role: true,
        },
      });
    });
  });
});
