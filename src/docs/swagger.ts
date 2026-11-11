import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';
import { extendedSwaggerPaths } from './swagger-paths-extended';

export const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'DIANO E-Commerce API',
    version: '1.0.0',
    description: 'High-performance, secure backend API for DIANO multi-vendor e-commerce platform',
  },
  servers: [
    {
      url: `http://localhost:${env.PORT}`,
      description: 'Local Development Server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT access token in the Authorization header as: Bearer <token>',
      },
      CookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'diano_refresh_token',
        description: 'HttpOnly cookie containing the rotating refresh token',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          statusCode: { type: 'integer' },
          message: { type: 'string' },
          data: { type: 'object', nullable: true },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      UserResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string', nullable: true },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'] },
          roles: { type: 'array', items: { type: 'string' } },
          permissions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Effective granular permission slugs for the authenticated user',
          },
          isSuperAdmin: {
            type: 'boolean',
            description: 'True when the user holds the super-admin role',
          },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', example: '+8801712345678' },
          name: { type: 'string', minLength: 2 },
          password: {
            type: 'string',
            format: 'password',
            description: 'Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character',
          },
        },
      },
      LoginInput: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      CreateAdminUserInput: {
        type: 'object',
        required: ['email', 'name', 'roleSlug'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 2 },
          phone: { type: 'string', example: '+8801712345678' },
          roleSlug: { type: 'string', example: 'manager' },
          password: { type: 'string', format: 'password', nullable: true },
        },
      },
      UpdateUserInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          roleSlug: { type: 'string' },
        },
      },
      CreateRoleInput: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          permissionSlugs: { type: 'array', items: { type: 'string' } },
        },
      },
      AssignPermissionsInput: {
        type: 'object',
        required: ['permissionSlugs'],
        properties: {
          permissionSlugs: { type: 'array', items: { type: 'string' } },
        },
      },
      CustomerAddressInput: {
        type: 'object',
        required: ['fullName', 'phone', 'addressLine', 'district', 'city'],
        properties: {
          type: { type: 'string', enum: ['SHIPPING', 'BILLING'], default: 'SHIPPING' },
          isDefault: { type: 'boolean', default: false },
          fullName: { type: 'string' },
          phone: { type: 'string', example: '+8801712345678' },
          alternativePhone: { type: 'string', nullable: true },
          addressLine: { type: 'string' },
          district: { type: 'string' },
          city: { type: 'string' },
          area: { type: 'string', nullable: true },
          postalCode: { type: 'string', nullable: true },
          landmark: { type: 'string', nullable: true },
        },
      },
      CustomerConsentsInput: {
        type: 'object',
        required: ['consents'],
        properties: {
          consents: {
            type: 'array',
            items: {
              type: 'object',
              required: ['channel', 'purpose', 'isGranted'],
              properties: {
                channel: { type: 'string', enum: ['SMS', 'EMAIL', 'WHATSAPP'] },
                purpose: { type: 'string', enum: ['MARKETING', 'RECOVERY', 'ANALYTICS'] },
                isGranted: { type: 'boolean' },
              },
            },
          },
        },
      },
      CustomerNoteInput: {
        type: 'object',
        required: ['note'],
        properties: {
          note: { type: 'string' },
        },
      },
    },
  },
  paths: {
    // -------------------------------------------------------------------------
    // AUTHENTICATION
    // -------------------------------------------------------------------------
    '/api/v1/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new customer account',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: { 201: { description: 'Account registered' }, 409: { description: 'Email/phone taken' } },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Customer portal login (administrative accounts rejected)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: { 200: { description: 'Authenticated' }, 401: { description: 'Invalid credentials' }, 403: { description: 'Admin account rejected' } },
      },
    },
    '/api/v1/auth/admin/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Dedicated admin portal login',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } },
        },
        responses: { 200: { description: 'Authenticated' }, 403: { description: 'Customer account rejected' } },
      },
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate refresh token and issue new access token',
        responses: { 200: { description: 'Refreshed' }, 401: { description: 'Invalid or reused' } },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke active refresh token and current session',
        responses: { 200: { description: 'Logged out' } },
      },
    },
    '/api/v1/auth/logout-all': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke all sessions across all devices',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'All sessions terminated' } },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user identity, roles, and effective permission slugs',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Profile retrieved with roles, permissions: string[], and isSuperAdmin',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserResponse' },
              },
            },
          },
        },
      },
    },

    // -------------------------------------------------------------------------
    // USERS (ADMIN MANAGEMENT)
    // -------------------------------------------------------------------------
    '/api/v1/users': {
      get: {
        tags: ['Users Management'],
        summary: 'List users with pagination, search, role, and status filtering',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated user list' } },
      },
      post: {
        tags: ['Users Management'],
        summary: 'Create administrative account with role hierarchy escalation checks',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAdminUserInput' } } },
        },
        responses: { 201: { description: 'User created' }, 403: { description: 'Privilege escalation denied' } },
      },
    },
    '/api/v1/users/{id}': {
      get: {
        tags: ['Users Management'],
        summary: 'Get user details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User retrieved' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Users Management'],
        summary: 'Update user profile or role (escalation protected, revokes sessions on role change)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserInput' } } },
        },
        responses: { 200: { description: 'User updated' }, 403: { description: 'Escalation or last super-admin violation' } },
      },
      delete: {
        tags: ['Users Management'],
        summary: 'Soft-delete user (self-delete blocked, last super-admin blocked, revokes sessions)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'User deactivated' }, 400: { description: 'Self-deletion' }, 403: { description: 'Last super-admin' } },
      },
    },
    '/api/v1/users/{id}/status': {
      patch: {
        tags: ['Users Management'],
        summary: 'Update user status (ACTIVE / SUSPENDED; self-suspend blocked, revokes sessions)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] } } } } },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/v1/users/{id}/revoke-sessions': {
      post: {
        tags: ['Users Management'],
        summary: 'Terminate all active sessions of a specified user',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Sessions revoked' } },
      },
    },

    // -------------------------------------------------------------------------
    // ROLES & PERMISSIONS
    // -------------------------------------------------------------------------
    '/api/v1/roles': {
      get: {
        tags: ['Roles & Permissions'],
        summary: 'List all system and custom RBAC roles',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Roles list' } },
      },
      post: {
        tags: ['Roles & Permissions'],
        summary: 'Create custom role with permission escalation validation',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateRoleInput' } } },
        },
        responses: { 201: { description: 'Role created' }, 403: { description: 'Escalation denied' } },
      },
    },
    '/api/v1/roles/{id}': {
      get: {
        tags: ['Roles & Permissions'],
        summary: 'Get role details and its permissions',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Role details' } },
      },
      patch: {
        tags: ['Roles & Permissions'],
        summary: 'Update custom role (system roles immutable)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Role updated' }, 403: { description: 'System role immutable' } },
      },
      delete: {
        tags: ['Roles & Permissions'],
        summary: 'Delete custom role (system roles cannot be deleted; assigned roles blocked)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Role deleted' }, 400: { description: 'Users assigned' }, 403: { description: 'System role' } },
      },
    },
    '/api/v1/roles/{id}/permissions': {
      put: {
        tags: ['Roles & Permissions'],
        summary: 'Assign permissions to role (invalidates server cache, escalation blocked)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignPermissionsInput' } } },
        },
        responses: { 200: { description: 'Permissions assigned' }, 403: { description: 'Escalation denied' } },
      },
    },
    '/api/v1/permissions': {
      get: {
        tags: ['Roles & Permissions'],
        summary: 'Read-only grouped permissions list',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Grouped permissions' } },
      },
    },

    // -------------------------------------------------------------------------
    // CUSTOMERS (SELF-SERVICE)
    // -------------------------------------------------------------------------
    '/api/v1/customers/me/profile': {
      get: {
        tags: ['Customer Self-Service'],
        summary: 'Get authenticated customer profile',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Profile retrieved' } },
      },
      patch: {
        tags: ['Customer Self-Service'],
        summary: 'Update authenticated customer profile',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Profile updated' } },
      },
    },
    '/api/v1/customers/me/addresses': {
      get: {
        tags: ['Customer Self-Service'],
        summary: 'List customer saved addresses',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Address list' } },
      },
      post: {
        tags: ['Customer Self-Service'],
        summary: 'Add address (max 10 limit, default address switching)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerAddressInput' } } },
        },
        responses: { 201: { description: 'Address created' }, 400: { description: 'Limit exceeded' } },
      },
    },
    '/api/v1/customers/me/addresses/{addressId}': {
      patch: {
        tags: ['Customer Self-Service'],
        summary: 'Update address (ownership verified)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Address updated' }, 403: { description: 'Not owner' } },
      },
      delete: {
        tags: ['Customer Self-Service'],
        summary: 'Delete address (ownership verified)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'addressId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Address deleted' }, 403: { description: 'Not owner' } },
      },
    },
    '/api/v1/customers/me/consents': {
      get: {
        tags: ['Customer Self-Service'],
        summary: 'Get marketing & recovery consent preferences',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Consents retrieved' } },
      },
      patch: {
        tags: ['Customer Self-Service'],
        summary: 'Update consent preferences (writes audit history)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerConsentsInput' } } },
        },
        responses: { 200: { description: 'Consents updated' } },
      },
    },
    '/api/v1/customers/me/data-export': {
      get: {
        tags: ['Customer Self-Service'],
        summary: 'Export personal data JSON (profile, addresses, consents, logins)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Data export object' } },
      },
    },
    '/api/v1/customers/me/delete-account': {
      post: {
        tags: ['Customer Self-Service'],
        summary: 'Request account deletion (soft-deletes, anonymizes PII, revokes sessions)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Account deleted and personal data anonymized' } },
      },
    },

    // -------------------------------------------------------------------------
    // CUSTOMERS (ADMIN MANAGEMENT)
    // -------------------------------------------------------------------------
    '/api/v1/customers': {
      get: {
        tags: ['Customer Admin Management'],
        summary: 'List customers with search and pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated customers' } },
      },
    },
    '/api/v1/customers/{id}': {
      get: {
        tags: ['Customer Admin Management'],
        summary: 'Get customer detail with addresses, consents, and order summary',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Customer details' } },
      },
    },
    '/api/v1/customers/{id}/status': {
      patch: {
        tags: ['Customer Admin Management'],
        summary: 'Update customer status (ACTIVE / SUSPENDED; revokes sessions on suspension)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/v1/customers/{id}/notes': {
      get: {
        tags: ['Customer Admin Management'],
        summary: 'Get administrative notes for customer',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notes list' } },
      },
      post: {
        tags: ['Customer Admin Management'],
        summary: 'Add administrative note to customer',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerNoteInput' } } },
        },
        responses: { 201: { description: 'Note added' } },
      },
    },
    '/api/v1/customers/{id}/timeline': {
      get: {
        tags: ['Customer Admin Management'],
        summary: 'Aggregated activity timeline (logins, notes, status changes)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Timeline list' } },
      },
    },

    // ==========================================
    // CATALOG: CATEGORIES
    // ==========================================
    '/api/v1/categories': {
      get: {
        tags: ['Catalog: Categories'],
        summary: 'Get active category hierarchy tree with product counts (Public)',
        responses: { 200: { description: 'Active category tree' } },
      },
      post: {
        tags: ['Catalog: Categories'],
        summary: 'Create category (Admin, max depth 3, cycle protected)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  description: { type: 'string' },
                  image: { type: 'string' },
                  parentId: { type: 'string', nullable: true },
                  isFeatured: { type: 'boolean' },
                  isActive: { type: 'boolean' },
                  sortOrder: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Category created' } },
      },
    },
    '/api/v1/categories/{slug}': {
      get: {
        tags: ['Catalog: Categories'],
        summary: 'Get category detail by slug with breadcrumbs and active children (Public)',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Category detail' }, 404: { description: 'Not found' } },
      },
    },
    '/api/v1/categories/{id}': {
      patch: {
        tags: ['Catalog: Categories'],
        summary: 'Update category (Admin, cycle protected, max depth limit)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Category updated' } },
      },
      delete: {
        tags: ['Catalog: Categories'],
        summary: 'Soft-delete category with product/sub-category safety reassignment (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'reassignToId', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Category deleted' } },
      },
    },
    '/api/v1/categories/{id}/status': {
      patch: {
        tags: ['Catalog: Categories'],
        summary: 'Toggle category active status (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', properties: { isActive: { type: 'boolean' } } } } },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/v1/categories/{id}/image': {
      post: {
        tags: ['Catalog: Categories'],
        summary: 'Upload category image file (Admin, verified magic bytes)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'multipart/form-data': { schema: { type: 'object', properties: { image: { type: 'string', format: 'binary' } } } } },
        },
        responses: { 200: { description: 'Image uploaded' } },
      },
      patch: {
        tags: ['Catalog: Categories'],
        summary: 'Set category image URL or remove (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { image: { type: 'string', nullable: true } } } } },
        },
        responses: { 200: { description: 'Image URL updated' } },
      },
    },
    '/api/v1/categories/reorder': {
      put: {
        tags: ['Catalog: Categories'],
        summary: 'Batch reorder category sort order (Admin)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Categories reordered' } },
      },
    },

    // ==========================================
    // CATALOG: PRODUCTS & VARIANTS
    // ==========================================
    '/api/v1/products': {
      get: {
        tags: ['Catalog: Products'],
        summary: 'Get paginated catalog products with filters and search (Public)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'categoryId', in: 'query', schema: { type: 'string' } },
          { name: 'minPrice', in: 'query', schema: { type: 'number' } },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['newest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'popular'] } },
        ],
        responses: { 200: { description: 'Catalog products' } },
      },
      post: {
        tags: ['Catalog: Products'],
        summary: 'Create product + variants together in atomic transaction (Admin)',
        security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Product created' } },
      },
    },
    '/api/v1/products/featured': {
      get: {
        tags: ['Catalog: Products'],
        summary: 'Get featured products for homepage (Public)',
        responses: { 200: { description: 'Featured products' } },
      },
    },
    '/api/v1/products/{slug}': {
      get: {
        tags: ['Catalog: Products'],
        summary: 'Get product detail by slug with variants and images (Public)',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Product detail' }, 404: { description: 'Not found' } },
      },
    },
    '/api/v1/products/{slug}/related': {
      get: {
        tags: ['Catalog: Products'],
        summary: 'Get related products for product page (Public)',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Related products' } },
      },
    },
    '/api/v1/products/{id}': {
      patch: {
        tags: ['Catalog: Products'],
        summary: 'Update product details (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Product updated' } },
      },
      delete: {
        tags: ['Catalog: Products'],
        summary: 'Soft-delete product (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Product deleted' } },
      },
    },
    '/api/v1/products/{id}/status': {
      patch: {
        tags: ['Catalog: Products'],
        summary: 'Transition product status: DRAFT / ACTIVE / ARCHIVED (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/v1/products/{id}/featured': {
      patch: {
        tags: ['Catalog: Products'],
        summary: 'Toggle product isFeatured flag (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Featured flag toggled' } },
      },
    },
    '/api/v1/products/{id}/variants': {
      post: {
        tags: ['Catalog: Variants'],
        summary: 'Add variant to product (Admin, unique SKU/barcode)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Variant added' } },
      },
    },
    '/api/v1/products/{id}/variants/{variantId}': {
      patch: {
        tags: ['Catalog: Variants'],
        summary: 'Update variant with price-change audit logging (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Variant updated' } },
      },
      delete: {
        tags: ['Catalog: Variants'],
        summary: 'Soft-delete variant (Admin, blocked if active stock or order reference)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Variant deleted' } },
      },
    },
    '/api/v1/products/{id}/images': {
      post: {
        tags: ['Catalog: Images'],
        summary: 'Upload gallery images to product (Admin, multipart, magic-byte checked)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Images uploaded' } },
      },
    },
    '/api/v1/products/{id}/images/{imageId}': {
      patch: {
        tags: ['Catalog: Images'],
        summary: 'Update image metadata (altText, isPrimary, sortOrder)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'imageId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Image updated' } },
      },
      delete: {
        tags: ['Catalog: Images'],
        summary: 'Delete image from database and underlying storage',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'imageId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Image deleted' } },
      },
    },
    '/api/v1/products/admin/form-options': {
      get: {
        tags: ['Catalog: Products'],
        summary: 'Get all dynamic form configuration options, category tree, and limits for Admin product form',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Admin form options retrieved' } },
      },
    },
    '/api/v1/products/{id}/images/thumbnail': {
      post: {
        tags: ['Catalog: Images'],
        summary: 'Upload or replace product THUMBNAIL image (replaces previous, destroys old from Cloudinary)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Thumbnail uploaded and replaced' } },
      },
    },
    '/api/v1/products/{id}/images/backview': {
      post: {
        tags: ['Catalog: Images'],
        summary: 'Upload or replace product BACKVIEW image (replaces previous, destroys old from Cloudinary)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Backview uploaded and replaced' } },
      },
    },
    '/api/v1/products/{id}/images/gallery': {
      post: {
        tags: ['Catalog: Images'],
        summary: 'Upload GALLERY image (strictly max 4 gallery images per product)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Gallery image uploaded' } },
      },
    },
    '/api/v1/categories/{id}/product-form-schema': {
      get: {
        tags: ['Catalog: Categories'],
        summary: 'Get dynamic specification template for category (with ancestor inheritance)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Category product form schema retrieved' } },
      },
    },
    '/api/v1/categories/{id}/specification-template': {
      patch: {
        tags: ['Catalog: Categories'],
        summary: 'Update specification template field definitions for category (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Specification template updated' } },
      },
    },
    '/api/v1/products/{id}/images/reorder': {
      put: {
        tags: ['Catalog: Images'],
        summary: 'Batch reorder gallery images for product (GALLERY slot only)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Images reordered' } },
      },
    },
    // ==============================================================================
    // INVENTORY & STOCK LEDGER
    // ==============================================================================
    '/api/v1/inventory/summary': {
      get: {
        tags: ['Inventory'],
        summary: 'Get aggregated inventory summary totals and financial valuations (cost fields require inventory:view_cost)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'warehouseId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Inventory summary retrieved' } },
      },
    },
    '/api/v1/inventory/movements': {
      get: {
        tags: ['Inventory'],
        summary: 'List paginated immutable stock movements ledger',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'variantId', in: 'query', schema: { type: 'string' } },
          { name: 'warehouseId', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Movements ledger list retrieved' } },
      },
    },
    '/api/v1/inventory/low-stock': {
      get: {
        tags: ['Inventory'],
        summary: 'List variants at or below reorderLevel threshold',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'warehouseId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Low stock items retrieved' } },
      },
    },
    '/api/v1/inventory/variant/{variantId}': {
      get: {
        tags: ['Inventory'],
        summary: 'Get multi-warehouse inventory breakdown for a specific variant',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'warehouseId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Variant inventory retrieved' } },
      },
    },
    '/api/v1/inventory': {
      get: {
        tags: ['Inventory'],
        summary: 'List paginated inventory items with filtering and search',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'warehouseId', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'lowStockOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'outOfStockOnly', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Inventory list retrieved' } },
      },
    },
    '/api/v1/inventory/receive': {
      post: {
        tags: ['Inventory'],
        summary: 'Receive stock into warehouse with immutable ledger entry',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'warehouseId', 'quantity'],
                properties: {
                  variantId: { type: 'string' },
                  warehouseId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                  reason: { type: 'string' },
                  referenceType: { type: 'string' },
                  referenceId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Stock received successfully' } },
      },
    },
    '/api/v1/inventory/adjust': {
      post: {
        tags: ['Inventory'],
        summary: 'Record manual stock adjustment (positive or negative) with required audit reason',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'warehouseId', 'quantity', 'reason'],
                properties: {
                  variantId: { type: 'string' },
                  warehouseId: { type: 'string' },
                  quantity: { type: 'integer' },
                  reason: { type: 'string', minLength: 3 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Stock adjusted' } },
      },
    },
    '/api/v1/inventory/damage': {
      post: {
        tags: ['Inventory'],
        summary: 'Mark items as damaged (quarantined from available stock)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'warehouseId', 'quantity', 'reason'],
                properties: {
                  variantId: { type: 'string' },
                  warehouseId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                  reason: { type: 'string', minLength: 3 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Damaged stock quarantined' } },
      },
    },
    '/api/v1/inventory/transfer': {
      post: {
        tags: ['Inventory'],
        summary: 'Atomic inter-warehouse stock transfer with deadlock-safe lock ordering',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'sourceWarehouseId', 'targetWarehouseId', 'quantity', 'reason'],
                properties: {
                  variantId: { type: 'string' },
                  sourceWarehouseId: { type: 'string' },
                  targetWarehouseId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                  reason: { type: 'string', minLength: 3 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Stock transferred' } },
      },
    },
    // ==============================================================================
    // STOCK AUDITS
    // ==============================================================================
    '/api/v1/inventory/audits': {
      post: {
        tags: ['Inventory: Audit'],
        summary: 'Start physical stock audit for warehouse (status IN_PROGRESS)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['warehouseId'],
                properties: {
                  warehouseId: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Audit initiated' } },
      },
      get: {
        tags: ['Inventory: Audit'],
        summary: 'List stock audits',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'warehouseId', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Stock audits list' } },
      },
    },
    '/api/v1/inventory/audits/{id}': {
      get: {
        tags: ['Inventory: Audit'],
        summary: 'Get stock audit details with discrepancy calculations',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Audit details' } },
      },
    },
    '/api/v1/inventory/audits/{id}/counts': {
      post: {
        tags: ['Inventory: Audit'],
        summary: 'Record physical count entries and calculate variances against system on-hand',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['variantId', 'countedQuantity'],
                      properties: {
                        variantId: { type: 'string' },
                        countedQuantity: { type: 'integer', minimum: 0 },
                        notes: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Counts recorded and variances updated' } },
      },
    },
    '/api/v1/inventory/audits/{id}/approve': {
      post: {
        tags: ['Inventory: Audit'],
        summary: 'Approve audit and reconcile all variances strictly via ledger movements (direct update blocked)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Audit approved and ledger reconciled' } },
      },
    },
    '/api/v1/inventory/audits/{id}/reject': {
      post: {
        tags: ['Inventory: Audit'],
        summary: 'Reject audit without adjusting stock levels',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Audit rejected' } },
      },
    },
    // ==============================================================================
    // SUPPLIERS
    // ==============================================================================
    '/api/v1/suppliers': {
      get: {
        tags: ['Suppliers'],
        summary: 'List paginated suppliers',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Suppliers retrieved' } },
      },
      post: {
        tags: ['Suppliers'],
        summary: 'Create new supplier with unique code and validation',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 2 },
                  code: { type: 'string' },
                  contactPerson: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  address: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Supplier created' } },
      },
    },
    '/api/v1/suppliers/{id}': {
      get: {
        tags: ['Suppliers'],
        summary: 'Get supplier by ID with purchase orders count',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Supplier retrieved' } },
      },
      patch: {
        tags: ['Suppliers'],
        summary: 'Update supplier details',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Supplier updated' } },
      },
      delete: {
        tags: ['Suppliers'],
        summary: 'Soft-delete supplier',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Supplier soft deleted' } },
      },
    },
    // ==============================================================================
    // PURCHASE ORDERS
    // ==============================================================================
    '/api/v1/purchase-orders': {
      get: {
        tags: ['Purchase Orders'],
        summary: 'List paginated purchase orders with filtering by supplier, warehouse, variant, status, and dates',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'supplierId', in: 'query', schema: { type: 'string' } },
          { name: 'warehouseId', in: 'query', schema: { type: 'string' } },
          { name: 'variantId', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Purchase orders retrieved' } },
      },
      post: {
        tags: ['Purchase Orders'],
        summary: 'Create draft purchase order with line items',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['supplierId', 'items'],
                properties: {
                  supplierId: { type: 'string' },
                  warehouseId: { type: 'string' },
                  expectedDeliveryDate: { type: 'string', format: 'date-time' },
                  notes: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['variantId', 'orderedQuantity', 'unitCost'],
                      properties: {
                        variantId: { type: 'string' },
                        orderedQuantity: { type: 'integer', minimum: 1 },
                        unitCost: { type: 'number', minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Purchase order created' } },
      },
    },
    '/api/v1/purchase-orders/{id}': {
      get: {
        tags: ['Purchase Orders'],
        summary: 'Get purchase order details including supplier, warehouse, and line items',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Purchase order details' } },
      },
    },
    '/api/v1/purchase-orders/{id}/status': {
      patch: {
        tags: ['Purchase Orders'],
        summary: 'Transition purchase order status (state machine validation)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['ORDERED', 'CANCELLED'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/api/v1/purchase-orders/{id}/receive': {
      post: {
        tags: ['Purchase Orders'],
        summary: 'Receive items against purchase order (supports partial receive, blocks over-receive, calculates weighted average cost)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['items'],
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['variantId', 'quantity'],
                      properties: {
                        variantId: { type: 'string' },
                        quantity: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Goods received and inventory/costing updated' } },
      },
    },
    // ==========================================
    // M7: Cart & Wishlist
    // ==========================================
    '/api/v1/cart': {
      get: {
        tags: ['Cart'],
        summary: 'Get active cart (Guest or Authenticated Customer)',
        responses: { 200: { description: 'Cart retrieved successfully' } },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Clear all items in active cart',
        responses: { 200: { description: 'Cart cleared' } },
      },
    },
    '/api/v1/cart/items': {
      post: {
        tags: ['Cart'],
        summary: 'Add item to active cart (Strict server pricing snapshot)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId', 'quantity'],
                properties: {
                  variantId: { type: 'string' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Item added to cart' } },
      },
    },
    '/api/v1/cart/items/{variantId}': {
      patch: {
        tags: ['Cart'],
        summary: 'Update cart item quantity',
        parameters: [{ name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['quantity'],
                properties: { quantity: { type: 'integer', minimum: 0 } },
              },
            },
          },
        },
        responses: { 200: { description: 'Item quantity updated' } },
      },
      delete: {
        tags: ['Cart'],
        summary: 'Remove single item from cart',
        parameters: [{ name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Item removed from cart' } },
      },
    },
    '/api/v1/cart/merge': {
      post: {
        tags: ['Cart'],
        summary: 'Merge guest cart into authenticated customer cart upon login',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { guestToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Cart merged successfully' } },
      },
    },
    '/api/v1/cart/validate': {
      post: {
        tags: ['Cart'],
        summary: 'Validate cart against live inventory and catalog prices (Auto-applies price changes)',
        responses: { 200: { description: 'Cart validated' } },
      },
    },
    '/api/v1/wishlist': {
      get: {
        tags: ['Wishlist'],
        summary: 'Get customer wishlist (Cost price strictly excluded)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Wishlist retrieved' } },
      },
    },
    '/api/v1/wishlist/items': {
      post: {
        tags: ['Wishlist'],
        summary: 'Add item to wishlist (Idempotent)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['variantId'],
                properties: { variantId: { type: 'string' }, productId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Item added to wishlist' } },
      },
    },
    '/api/v1/wishlist/items/{variantId}': {
      delete: {
        tags: ['Wishlist'],
        summary: 'Remove item from wishlist',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Item removed from wishlist' } },
      },
    },
    '/api/v1/wishlist/items/{variantId}/move-to-cart': {
      post: {
        tags: ['Wishlist'],
        summary: 'Move wishlist item to customer cart',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'variantId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Item moved to cart' } },
      },
    },
    // ==========================================
    // M8: Checkout & Abandoned Checkout
    // ==========================================
    '/api/v1/checkout/sessions': {
      post: {
        tags: ['Checkout'],
        summary: 'Initiate 128-bit unguessable checkout session from active cart snapshot',
        responses: { 201: { description: 'Checkout session created' } },
      },
    },
    '/api/v1/checkout/sessions/{id}': {
      get: {
        tags: ['Checkout'],
        summary: 'Get checkout session summary (Protected by IDOR & Secret token)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Checkout session summary' } },
      },
    },
    '/api/v1/checkout/sessions/{id}/customer-info': {
      patch: {
        tags: ['Checkout'],
        summary: 'Update customer contact info with BD phone format validation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Customer info updated' } },
      },
    },
    '/api/v1/checkout/sessions/{id}/shipping-info': {
      patch: {
        tags: ['Checkout'],
        summary: 'Update shipping address and recalculate dynamic shipping zone fee',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Shipping info updated' } },
      },
    },
    '/api/v1/checkout/sessions/{id}/delivery-method': {
      patch: {
        tags: ['Checkout'],
        summary: 'Update delivery method option',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Delivery method updated' } },
      },
    },
    '/api/v1/checkout/sessions/{id}/payment-method': {
      patch: {
        tags: ['Checkout'],
        summary: 'Select payment provider (COD, SSLCOMMERZ)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payment method selected' } },
      },
    },
    '/api/v1/checkout/sessions/{id}/events': {
      post: {
        tags: ['Checkout'],
        summary: 'Record client telemetry event with strict allowlisting (Strictly NO PII)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Event recorded' } },
      },
    },
    '/api/v1/abandoned-checkouts': {
      get: {
        tags: ['Abandoned Checkout'],
        summary: 'Admin: List filtered abandoned checkouts',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Abandoned checkouts list' } },
      },
    },
    '/api/v1/abandoned-checkouts/stats': {
      get: {
        tags: ['Abandoned Checkout'],
        summary: 'Admin: Aggregated funnel statistics with Asia/Dhaka date windowing',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Aggregated statistics' } },
      },
    },
    '/api/v1/abandoned-checkouts/{id}': {
      get: {
        tags: ['Abandoned Checkout'],
        summary: 'Admin: Checkout session detail with timeline and audited PII viewing',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Checkout session details' } },
      },
    },
    '/api/v1/abandoned-checkouts/{id}/recovery': {
      post: {
        tags: ['Abandoned Checkout'],
        summary: 'Admin: Manually trigger recovery message dispatch with consent guard',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Recovery message triggered' } },
      },
    },
    // Site Settings
    '/api/v1/settings/{group}': {
      get: {
        tags: ['Site Settings'],
        summary: 'Admin: Get typed setting group (store_profile, invoice, seo_defaults, contact)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'group', in: 'path', required: true, schema: { type: 'string', enum: ['store_profile', 'invoice', 'seo_defaults', 'contact'] } }],
        responses: { 200: { description: 'Setting group configuration' } },
      },
      patch: {
        tags: ['Site Settings'],
        summary: 'Admin: Update typed setting group with validation and audit diff',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'group', in: 'path', required: true, schema: { type: 'string', enum: ['store_profile', 'invoice', 'seo_defaults', 'contact'] } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Updated setting group' } },
      },
    },
    '/api/v1/settings/logo': {
      post: {
        tags: ['Site Settings'],
        summary: 'Admin: Upload store logo (PNG, JPEG, WebP only, magic-byte validated)',
        security: [{ BearerAuth: [] }],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { logo: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Store logo updated' } },
      },
    },
    '/api/v1/settings/favicon': {
      post: {
        tags: ['Site Settings'],
        summary: 'Admin: Upload store favicon (ICO, PNG, WebP only, magic-byte validated)',
        security: [{ BearerAuth: [] }],
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { favicon: { type: 'string', format: 'binary' } } } } } },
        responses: { 200: { description: 'Store favicon updated' } },
      },
    },
    '/api/v1/public/site-config': {
      get: {
        tags: ['Site Settings'],
        summary: 'Public: Sanitized safe site configuration with ETag caching',
        responses: {
          200: { description: 'Safe public store profile, contact and SEO settings' },
          304: { description: 'Not Modified (ETag match)' },
        },
      },
    },
    // Banners
    '/api/v1/banners': {
      get: {
        tags: ['Banners'],
        summary: 'Admin: List promotional banners with filters',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'placement', in: 'query', schema: { type: 'string', enum: ['HOME_HERO', 'HOME_SECONDARY', 'CATEGORY_TOP', 'ANNOUNCEMENT_BAR', 'POPUP'] } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Paginated list of banners' } },
      },
      post: {
        tags: ['Banners'],
        summary: 'Admin: Create a promotional banner with scheduling bounds',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Banner created' } },
      },
    },
    '/api/v1/banners/reorder': {
      put: {
        tags: ['Banners'],
        summary: 'Admin: Reorder banners within placement',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        sortOrder: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Banners reordered' } },
      },
    },
    '/api/v1/banners/{id}': {
      get: {
        tags: ['Banners'],
        summary: 'Admin: Get banner by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Banner details' } },
      },
      put: {
        tags: ['Banners'],
        summary: 'Admin: Update banner details',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Banner updated' } },
      },
      delete: {
        tags: ['Banners'],
        summary: 'Admin: Delete banner',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Banner deleted' } },
      },
    },
    '/api/v1/banners/{id}/toggle': {
      patch: {
        tags: ['Banners'],
        summary: 'Admin: Toggle banner active state',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Banner active state toggled' } },
      },
    },
    '/api/v1/public/banners': {
      get: {
        tags: ['Banners'],
        summary: 'Public: Get active banners by placement within schedule window (Asia/Dhaka)',
        parameters: [{ name: 'placement', in: 'query', required: true, schema: { type: 'string', enum: ['HOME_HERO', 'HOME_SECONDARY', 'CATEGORY_TOP', 'ANNOUNCEMENT_BAR', 'POPUP'] } }],
        responses: { 200: { description: 'Active banners list' } },
      },
    },
    // CMS Pages
    '/api/v1/pages': {
      get: {
        tags: ['CMS Pages'],
        summary: 'Admin: List CMS pages with filters',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['POLICY', 'ABOUT', 'FAQ', 'CUSTOM'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['DRAFT', 'PUBLISHED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Paginated pages' } },
      },
      post: {
        tags: ['CMS Pages'],
        summary: 'Admin: Create a CMS page with typed block structure',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 201: { description: 'Page created' } },
      },
    },
    '/api/v1/pages/{id}': {
      get: {
        tags: ['CMS Pages'],
        summary: 'Admin: Get page details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Page details' } },
      },
      put: {
        tags: ['CMS Pages'],
        summary: 'Admin: Update page blocks, SEO metadata, and title',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { 200: { description: 'Page updated' } },
      },
      delete: {
        tags: ['CMS Pages'],
        summary: 'Admin: Delete page (blocked for system policy slugs)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Page deleted' }, 400: { description: 'System page cannot be deleted' } },
      },
    },
    '/api/v1/pages/{id}/publish': {
      post: {
        tags: ['CMS Pages'],
        summary: 'Admin: Publish page (increments version and snapshots PageRevision)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Page published and revision captured' } },
      },
    },
    '/api/v1/pages/{id}/unpublish': {
      post: {
        tags: ['CMS Pages'],
        summary: 'Admin: Unpublish page back to DRAFT',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Page unpublished' } },
      },
    },
    '/api/v1/pages/{id}/revisions': {
      get: {
        tags: ['CMS Pages'],
        summary: 'Admin: List historical append-only page revisions',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of page revisions' } },
      },
    },
    '/api/v1/pages/{id}/revisions/{version}/restore': {
      post: {
        tags: ['CMS Pages'],
        summary: 'Admin: Restore page content from a past revision version',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'version', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Page restored from revision' } },
      },
    },
    '/api/v1/public/pages': {
      get: {
        tags: ['CMS Pages'],
        summary: 'Public: Navigation list of published pages (slug, title, type)',
        responses: { 200: { description: 'Published pages navigation list' } },
      },
    },
    '/api/v1/public/pages/{slug}': {
      get: {
        tags: ['CMS Pages'],
        summary: 'Public: Get published page content blocks by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Published page content' }, 404: { description: 'Page not found or draft' } },
      },
    },
    // ==========================================
    // M9: Orders & Invoice
    // ==========================================
    '/api/v1/orders': {
      post: {
        tags: ['Orders'],
        summary: 'Customer: Place order from checkout session (Idempotency-Key required)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['checkoutSessionId'],
                properties: {
                  checkoutSessionId: { type: 'string' },
                  guestSecretToken: { type: 'string' },
                  customerNotes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Order created successfully' },
          200: { description: 'Idempotent replay returning existing order' },
          409: { description: 'Idempotency key reused with different payload' },
        },
      },
      get: {
        tags: ['Orders'],
        summary: 'Customer: List own orders (paginated)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Customer orders list' } },
      },
    },
    '/api/v1/orders/track': {
      post: {
        tags: ['Orders'],
        summary: 'Public: Track order by orderNumber and phone (Rate limited, minimal data)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['orderNumber', 'phone'],
                properties: {
                  orderNumber: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Order tracking info' },
          404: { description: 'No matching order found' },
        },
      },
    },
    '/api/v1/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Customer: Get own order details (IDOR protected)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Order details' }, 403: { description: 'Access denied' } },
      },
    },
    '/api/v1/orders/{id}/cancel': {
      post: {
        tags: ['Orders'],
        summary: 'Customer: Cancel own PENDING Cash on Delivery order',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Order cancelled and stock released' } },
      },
    },
    '/api/v1/orders/{id}/invoice': {
      get: {
        tags: ['Orders'],
        summary: 'Customer: Stream PDF invoice for own order',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PDF stream', content: { 'application/pdf': {} } } },
      },
    },
    '/api/v1/admin/orders': {
      get: {
        tags: ['Admin Orders'],
        summary: 'Admin: Search, filter, and paginate orders',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'paymentStatus', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { 200: { description: 'Filtered orders list' } },
      },
    },
    '/api/v1/admin/orders/{id}': {
      get: {
        tags: ['Admin Orders'],
        summary: 'Admin: Get complete order details (masked costPrice unless order:view_cost)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Order details' } },
      },
    },
    '/api/v1/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin Orders'],
        summary: 'Admin: Transition order status machine (atomic side effects)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'],
                  },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Order status updated' },
          409: { description: 'Invalid status transition' },
        },
      },
    },
    '/api/v1/admin/orders/{id}/notes': {
      post: {
        tags: ['Admin Orders'],
        summary: 'Admin: Add internal or customer note',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['note'],
                properties: {
                  note: { type: 'string' },
                  isCustomerVisible: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Note added' } },
      },
    },
    '/api/v1/admin/orders/{id}/timeline': {
      get: {
        tags: ['Admin Orders'],
        summary: 'Admin: Get chronological status history audit trail',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Order status timeline' } },
      },
    },
    '/api/v1/admin/orders/{id}/invoice': {
      get: {
        tags: ['Admin Orders'],
        summary: 'Admin: Stream PDF invoice',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PDF stream', content: { 'application/pdf': {} } } },
      },
    },
    // ==========================================================================
    // PAYMENTS (CUSTOMER & GATEWAYS)
    // ==========================================================================
    '/api/v1/payments/initiate': {
      post: {
        tags: ['Payments'],
        summary: 'Customer: Initialize online payment session (SSLCOMMERZ)',
        security: [{ BearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['orderId'],
                properties: {
                  orderId: { type: 'string' },
                  guestToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Payment session initialized with GatewayPageURL' },
          400: { description: 'Invalid order state or payment method' },
          409: { description: 'Active attempt already in progress' },
        },
      },
    },
    '/api/v1/payments/sslcommerz/success': {
      post: {
        tags: ['Payments'],
        summary: 'Public: SSLCOMMERZ success redirect callback',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object' },
            },
          },
        },
        responses: { 302: { description: 'Browser redirect to frontend result page' } },
      },
    },
    '/api/v1/payments/sslcommerz/fail': {
      post: {
        tags: ['Payments'],
        summary: 'Public: SSLCOMMERZ failure redirect callback',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object' },
            },
          },
        },
        responses: { 302: { description: 'Browser redirect to frontend result page' } },
      },
    },
    '/api/v1/payments/sslcommerz/cancel': {
      post: {
        tags: ['Payments'],
        summary: 'Public: SSLCOMMERZ cancellation redirect callback',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object' },
            },
          },
        },
        responses: { 302: { description: 'Browser redirect to frontend result page' } },
      },
    },
    '/api/v1/payments/sslcommerz/ipn': {
      post: {
        tags: ['Payments'],
        summary: 'Public: SSLCOMMERZ Instant Payment Notification (IPN) webhook',
        requestBody: {
          required: true,
          content: {
            'application/x-www-form-urlencoded': {
              schema: { type: 'object' },
            },
          },
        },
        responses: { 200: { description: 'IPN processed or duplicate ignored' } },
      },
    },
    '/api/v1/payments/{orderId}/status': {
      get: {
        tags: ['Payments'],
        summary: 'Customer: Get payment status for order',
        security: [{ BearerAuth: [] }, {}],
        parameters: [{ name: 'orderId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payment status and attempt history' } },
      },
    },
    // ==========================================================================
    // ADMIN PAYMENTS & REFUNDS
    // ==========================================================================
    '/api/v1/admin/payments': {
      get: {
        tags: ['Admin Payments'],
        summary: 'Admin: List payments with filters and pagination',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'provider', in: 'query', schema: { type: 'string', enum: ['SSLCOMMERZ', 'COD'] } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'orderId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated payments' } },
      },
    },
    '/api/v1/admin/payments/{id}': {
      get: {
        tags: ['Admin Payments'],
        summary: 'Admin: Get payment details with events timeline and refunds',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payment details' } },
      },
    },
    '/api/v1/admin/payments/{id}/refund': {
      post: {
        tags: ['Admin Payments'],
        summary: 'Admin: Initiate refund',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount', 'reason'],
                properties: {
                  amount: { type: 'number', minimum: 0.01 },
                  reason: { type: 'string', minLength: 3 },
                  idempotencyKey: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Refund processed' } },
      },
    },
    '/api/v1/admin/payments/{id}/mark-cod-collected': {
      post: {
        tags: ['Admin Payments'],
        summary: 'Admin: Mark COD payment collected upon order delivery',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { note: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'COD payment marked collected' } },
      },
    },
    // -------------------------------------------------------------------------
    // EXPENSES & ANALYTICS (M13)
    // -------------------------------------------------------------------------
    '/api/v1/admin/expenses': {
      get: {
        tags: ['Admin Expenses'],
        summary: 'List operating expenses with filtering',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'List of expenses' } },
      },
      post: {
        tags: ['Admin Expenses'],
        summary: 'Create a new operating expense',
        security: [{ BearerAuth: [] }],
        responses: { 201: { description: 'Expense created' } },
      },
    },
    '/api/v1/admin/analytics/overview': {
      get: {
        tags: ['Admin Analytics'],
        summary: '13 KPI cards overview (including deliveredSales) with period comparison',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Overview KPI cards' } },
      },
    },
    '/api/v1/admin/analytics/revenue': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Detailed revenue, discounts, cogs, profit breakdown',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Revenue metrics' } },
      },
    },
    '/api/v1/admin/analytics/orders': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Order status breakdown, fulfillment SLA, cancellation rates',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Order metrics' } },
      },
    },
    '/api/v1/admin/analytics/products': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Top selling, worst selling, returns, and dead stock',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Product metrics' } },
      },
    },
    '/api/v1/admin/analytics/inventory': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Inventory valuation, stockouts, low stock counts',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Inventory metrics' } },
      },
    },
    '/api/v1/admin/analytics/customers': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Customer retention, CLV, top spenders, district distribution',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Customer metrics' } },
      },
    },
    '/api/v1/admin/analytics/payments': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Payment provider metrics, fees, pending COD collection',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Payment metrics' } },
      },
    },
    '/api/v1/admin/analytics/funnel': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Checkout session conversion funnel with drop-off rates',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Funnel metrics' } },
      },
    },
    '/api/v1/admin/analytics/charts/{type}': {
      get: {
        tags: ['Admin Analytics'],
        summary: 'Gap-filled chart time-series and distributions (including shipment-status and stock-by-subcategory)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'type',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              enum: [
                'sales-trend',
                'orders-trend',
                'profit-trend',
                'payment-method-pie',
                'order-status-pie',
                'top-categories-bar',
                'hourly-heatmap',
                'district-choropleth-data',
                'shipment-status',
                'stock-by-subcategory',
              ],
            },
          },
        ],
        responses: { 200: { description: 'Chart series' } },
      },
    },
    // -------------------------------------------------------------------------
    // REPORTS (M13)
    // -------------------------------------------------------------------------
    '/api/v1/admin/reports/orders': {
      post: {
        tags: ['Admin Reports'],
        summary: 'Export orders report as CSV, XLSX, or PDF',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Streaming export file' } },
      },
    },
    '/api/v1/admin/reports/sales': {
      post: {
        tags: ['Admin Reports'],
        summary: 'Export sales report aggregated by day, week, or month',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Streaming export file' } },
      },
    },
    '/api/v1/admin/reports/inventory': {
      post: {
        tags: ['Admin Reports'],
        summary: 'Export inventory stock valuation report',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Streaming export file' } },
      },
    },
    '/api/v1/admin/reports/customers': {
      post: {
        tags: ['Admin Reports'],
        summary: 'Export customer spending and order volume report',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Streaming export file' } },
      },
    },
    '/api/v1/admin/reports/financial': {
      post: {
        tags: ['Admin Reports'],
        summary: 'Export financial statement summary (requires analytics:view_finance)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Streaming export file' } },
      },
    },
    // -------------------------------------------------------------------------
    // NOTIFICATIONS & REALTIME
    // -------------------------------------------------------------------------
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List current user notifications (in-app)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Notification list' } },
      },
    },
    '/api/v1/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark an in-app notification as read',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Notification marked read' } },
      },
    },
    '/api/v1/notifications/preferences': {
      get: {
        tags: ['Notifications'],
        summary: 'Get current user notification preferences',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'User notification preferences' } },
      },
      patch: {
        tags: ['Notifications'],
        summary: 'Update notification preferences (transactional cannot be disabled)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Preferences updated' } },
      },
    },
    '/api/v1/admin/notifications': {
      get: {
        tags: ['Admin Notifications'],
        summary: 'List outbox notifications with channel, status and date filters',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Notification list' } },
      },
    },
    '/api/v1/admin/notifications/{id}/retry': {
      post: {
        tags: ['Admin Notifications'],
        summary: 'Manual retry for DEAD or FAILED notification',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Notification queued for retry' } },
      },
    },
  } as Record<string, Record<string, unknown>>,
};

// Deeply merge extended OpenAPI paths to preserve multi-method paths (e.g., GET and PATCH on same route)
for (const [pathKey, val] of Object.entries(extendedSwaggerPaths)) {
  const existing = swaggerDocument.paths[pathKey];
  if (existing) {
    swaggerDocument.paths[pathKey] = {
      ...existing,
      ...val,
    };
  } else {
    swaggerDocument.paths[pathKey] = val;
  }
}

export const setupSwagger = (app: Express): void => {
  if (env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    app.get(['/api/docs.json', '/api/docs/openapi.json', '/api/v1/openapi.json'], (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(swaggerDocument);
    });
    logger.info('Swagger documentation mounted at /api/docs');
  }
};
