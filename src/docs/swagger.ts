import type { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '@/config/env.config';
import { logger } from '@/utils/logger';

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
        summary: 'Get current user identity',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Profile retrieved' } },
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
    '/api/v1/products/{id}/images/reorder': {
      put: {
        tags: ['Catalog: Images'],
        summary: 'Batch reorder gallery images for product',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Images reordered' } },
      },
    },
  },
};

export const setupSwagger = (app: Express): void => {
  if (env.NODE_ENV !== 'production') {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    app.get('/api/docs.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerDocument);
    });
    logger.info('Swagger documentation mounted at /api/docs');
  }
};
