/**
 * Extended OpenAPI paths to ensure 100% endpoint coverage across all 253 routes.
 */

export const extendedSwaggerPaths: Record<string, Record<string, unknown>> = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Root liveness probe for reverse proxy and container monitoring',
      responses: {
        200: { description: 'Server process is alive and responsive' },
      },
    },
  },
  '/api/v1/health': {
    get: {
      tags: ['Health'],
      summary: 'API v1 liveness probe (lightweight, zero DB touch)',
      responses: {
        200: { description: 'API server is healthy' },
      },
    },
  },
  '/api/v1/ready': {
    get: {
      tags: ['Health'],
      summary: 'Readiness probe verifying PostgreSQL connection health',
      responses: {
        200: { description: 'All database and runtime dependencies ready' },
        503: { description: 'Dependencies unavailable' },
      },
    },
  },
  '/api/v1/internal/jobs/{name}': {
    post: {
      tags: ['Internal Maintenance Jobs'],
      summary: 'Trigger scheduled internal maintenance job with advisory lock',
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'name',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: [
              'reconcile-pending-payments',
              'cleanup-expired-orders',
              'trigger-abandoned-recovery',
              'sync-inventory-aggregates',
              'purge-old-notifications',
              'process-notifications',
              'archive-stale-drafts',
              'cleanup-expired-tokens',
            ],
          },
        },
        {
          name: 'x-jobs-secret',
          in: 'header',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: { description: 'Job executed or skipped if already running' },
        401: { description: 'Invalid or missing JOBS_SECRET' },
      },
    },
  },
  '/api/v1/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Request password reset token via email',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: { email: { type: 'string', format: 'email' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Generic success response (anti-enumeration)' },
      },
    },
  },
  '/api/v1/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Reset account password using reset token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password'],
              properties: {
                token: { type: 'string' },
                password: { type: 'string', minLength: 8 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Password reset successful' },
        400: { description: 'Invalid or expired reset token' },
      },
    },
  },
  '/api/v1/auth/verify-email': {
    post: {
      tags: ['Auth'],
      summary: 'Verify user email address using token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token'],
              properties: { token: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Email verified successfully' },
        400: { description: 'Invalid or expired verification token' },
      },
    },
  },
  '/api/v1/auth/otp/send': {
    post: {
      tags: ['Auth'],
      summary: 'Send SMS OTP code to customer phone',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phone'],
              properties: { phone: { type: 'string', example: '+8801712345678' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'OTP dispatched via SMS' },
      },
    },
  },
  '/api/v1/auth/otp/verify': {
    post: {
      tags: ['Auth'],
      summary: 'Verify SMS OTP code',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['phone', 'otp'],
              properties: {
                phone: { type: 'string' },
                otp: { type: 'string', minLength: 4, maxLength: 6 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'OTP verified successfully' },
        400: { description: 'Invalid or expired OTP' },
      },
    },
  },
  '/api/v1/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change password for currently authenticated user',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['currentPassword', 'newPassword'],
              properties: {
                currentPassword: { type: 'string' },
                newPassword: { type: 'string', minLength: 8 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Password changed successfully' },
        401: { description: 'Current password incorrect' },
      },
    },
  },
  '/api/v1/auth/me': {
    patch: {
      tags: ['Auth'],
      summary: 'Update current authenticated user basic profile',
      security: [{ BearerAuth: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Profile updated' },
      },
    },
  },
  '/api/v1/auth/login-history': {
    get: {
      tags: ['Auth'],
      summary: 'Get login history and active device sessions for current user',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Login history retrieved' },
      },
    },
  },
  '/api/v1/categories/admin/all': {
    get: {
      tags: ['Categories'],
      summary: 'List all categories with internal metrics (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Category list retrieved' },
      },
    },
  },
  '/api/v1/categories/admin/{id}': {
    get: {
      tags: ['Categories'],
      summary: 'Get single category details for administration',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Category details' },
        404: { description: 'Category not found' },
      },
    },
  },
  '/api/v1/products/admin/all': {
    get: {
      tags: ['Products'],
      summary: 'List all products including drafts and archived (Admin)',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Product list retrieved' },
      },
    },
  },
  '/api/v1/products/admin/{id}': {
    get: {
      tags: ['Products'],
      summary: 'Get product with cost prices and audit details (Admin)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Product details' },
        404: { description: 'Product not found' },
      },
    },
  },
  '/api/v1/checkout/sessions/{id}/coupon': {
    post: {
      tags: ['Checkout'],
      summary: 'Apply promotional coupon to active checkout session',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: { code: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Coupon applied to checkout' },
        400: { description: 'Invalid, expired, or spend requirement unmet' },
      },
    },
    delete: {
      tags: ['Checkout'],
      summary: 'Remove applied coupon from active checkout session',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Coupon removed from checkout' },
      },
    },
  },
  '/api/v1/admin/orders/{id}/shipments': {
    get: {
      tags: ['Admin Orders'],
      summary: 'List shipments for order',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Shipments list' },
      },
    },
    post: {
      tags: ['Admin Orders'],
      summary: 'Create/book shipment for order',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                courierCode: { type: 'string' },
                trackingNumber: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Shipment created' },
      },
    },
  },
  '/api/v1/admin/orders/{id}/shipments/status': {
    patch: {
      tags: ['Admin Orders'],
      summary: 'Update shipment status for order',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Shipment status updated' },
      },
    },
  },
  '/api/v1/admin/shipments/{id}/status': {
    patch: {
      tags: ['Admin Shipping'],
      summary: 'Direct update of shipment delivery status',
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
                  enum: ['PENDING', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED'],
                },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Shipment status updated' },
      },
    },
  },
  '/api/v1/admin/fraud/rules': {
    get: {
      tags: ['Admin Fraud Detection'],
      summary: 'List active fraud detection heuristic rules and threshold configurations',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Fraud rule list' },
      },
    },
  },
  '/api/v1/admin/fraud/rules/{key}': {
    patch: {
      tags: ['Admin Fraud Detection'],
      summary: 'Update weight or toggle active status for fraud detection rule',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                weight: { type: 'number' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Fraud rule updated' },
      },
    },
  },
  '/api/v1/admin/fraud/stats': {
    get: {
      tags: ['Admin Fraud Detection'],
      summary: 'Summary statistics of fraud assessment scores and review backlog',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Fraud statistics' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews': {
    get: {
      tags: ['Admin Fraud Detection'],
      summary: 'Paginated review queue of orders held for manual fraud review',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Fraud review queue items' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews/{id}': {
    get: {
      tags: ['Admin Fraud Detection'],
      summary: 'Detailed risk assessment factors for order',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Fraud assessment detail' },
        404: { description: 'Assessment not found' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews/{id}/approve': {
    post: {
      tags: ['Admin Fraud Detection'],
      summary: 'Manually approve order held in fraud queue (releases hold)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { notes: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Order approved and released' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews/{id}/reject': {
    post: {
      tags: ['Admin Fraud Detection'],
      summary: 'Manually reject fraudulent order and release inventory reservations',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { notes: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'Order rejected and cancelled' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews/{id}/request-otp': {
    post: {
      tags: ['Admin Fraud Detection'],
      summary: 'Dispatch challenge OTP to customer phone for verification',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Challenge OTP sent' },
      },
    },
  },
  '/api/v1/admin/fraud/reviews/{id}/verify-otp': {
    post: {
      tags: ['Admin Fraud Detection'],
      summary: 'Verify customer OTP response for held order',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['otp'],
              properties: { otp: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: { description: 'OTP verified, order released' },
        400: { description: 'Invalid OTP' },
      },
    },
  },
  '/api/v1/shipping/methods': {
    get: {
      tags: ['Shipping'],
      summary: 'List available shipping methods for customer selection',
      responses: {
        200: { description: 'Available shipping methods' },
      },
    },
  },
  '/api/v1/admin/shipping/zones': {
    get: {
      tags: ['Admin Shipping'],
      summary: 'List geographic delivery zones with district mappings',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Shipping zones list' },
      },
    },
    post: {
      tags: ['Admin Shipping'],
      summary: 'Create new geographic shipping zone',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'districts'],
              properties: {
                name: { type: 'string' },
                districts: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Shipping zone created' },
      },
    },
  },
  '/api/v1/admin/shipping/zones/{id}': {
    get: {
      tags: ['Admin Shipping'],
      summary: 'Get shipping zone details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Zone details' },
        404: { description: 'Zone not found' },
      },
    },
    patch: {
      tags: ['Admin Shipping'],
      summary: 'Update shipping zone districts and active status',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                districts: { type: 'array', items: { type: 'string' } },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Zone updated' },
      },
    },
    delete: {
      tags: ['Admin Shipping'],
      summary: 'Delete shipping zone',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Zone deleted' },
      },
    },
  },
  '/api/v1/admin/shipping/methods': {
    get: {
      tags: ['Admin Shipping'],
      summary: 'List all shipping rate methods with fee structures',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Methods list' },
      },
    },
    post: {
      tags: ['Admin Shipping'],
      summary: 'Create shipping method rate tier',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'name', 'baseFee', 'shippingZoneId'],
              properties: {
                code: { type: 'string' },
                name: { type: 'string' },
                baseFee: { type: 'string', example: '60.00' },
                perKgFee: { type: 'string', example: '20.00' },
                freeShippingThreshold: { type: 'string', example: '2000.00' },
                shippingZoneId: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Method created' },
      },
    },
  },
  '/api/v1/admin/shipping/methods/{id}': {
    patch: {
      tags: ['Admin Shipping'],
      summary: 'Update shipping method fee tier',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                baseFee: { type: 'string' },
                perKgFee: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Method updated' },
      },
    },
    delete: {
      tags: ['Admin Shipping'],
      summary: 'Delete shipping method rate tier',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Method deleted' },
      },
    },
  },
  '/api/v1/admin/shipping/orders/{id}/shipments': {
    get: {
      tags: ['Admin Shipping'],
      summary: 'List shipments for order under shipping route',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Shipments list' },
      },
    },
    post: {
      tags: ['Admin Shipping'],
      summary: 'Create shipment for order under shipping route',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        201: { description: 'Shipment created' },
      },
    },
  },
  '/api/v1/admin/shipping/orders/{id}/shipments/status': {
    patch: {
      tags: ['Admin Shipping'],
      summary: 'Update shipment status under shipping route',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Status updated' },
      },
    },
  },
  '/api/v1/admin/shipping/shipments/{id}/status': {
    patch: {
      tags: ['Admin Shipping'],
      summary: 'Update specific shipment delivery status',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Shipment status updated' },
      },
    },
  },
  '/api/v1/admin/coupons': {
    get: {
      tags: ['Admin Coupons'],
      summary: 'List promotional coupons with usage statistics',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Coupons list' },
      },
    },
    post: {
      tags: ['Admin Coupons'],
      summary: 'Create new promotional discount coupon',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code', 'type', 'value', 'startDate', 'endDate'],
              properties: {
                code: { type: 'string', example: 'SAVE20' },
                type: { type: 'string', enum: ['PERCENTAGE', 'FIXED', 'FREE_SHIPPING'] },
                value: { type: 'string', example: '20.00' },
                maxDiscount: { type: 'string', example: '500.00' },
                minSpend: { type: 'string', example: '1000.00' },
                usageLimit: { type: 'integer', example: 100 },
                userLimit: { type: 'integer', example: 1 },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Coupon created' },
      },
    },
  },
  '/api/v1/admin/coupons/{id}': {
    get: {
      tags: ['Admin Coupons'],
      summary: 'Get coupon details and usage statistics',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Coupon details' },
        404: { description: 'Coupon not found' },
      },
    },
    patch: {
      tags: ['Admin Coupons'],
      summary: 'Update coupon limits, validity, or active status',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Coupon updated' },
      },
    },
    delete: {
      tags: ['Admin Coupons'],
      summary: 'Soft-delete promotional coupon',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Coupon deleted' },
      },
    },
  },
  '/api/v1/admin/flash-sales': {
    post: {
      tags: ['Admin Coupons'],
      summary: 'Create time-limited flash sale promotion with variant price overrides',
      security: [{ BearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'startDate', 'endDate', 'items'],
              properties: {
                title: { type: 'string' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['variantId', 'salePrice'],
                    properties: {
                      variantId: { type: 'string' },
                      salePrice: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Flash sale created' },
      },
    },
  },
  '/api/v1/flash-sales': {
    get: {
      tags: ['Coupons'],
      summary: 'List active public flash sales and promotional items',
      responses: {
        200: { description: 'Active flash sales list' },
      },
    },
  },
  '/api/v1/admin/returns': {
    get: {
      tags: ['Admin Returns'],
      summary: 'List customer return requests with status and inspection filtering',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Returns list' },
      },
    },
  },
  '/api/v1/admin/returns/{id}': {
    get: {
      tags: ['Admin Returns'],
      summary: 'Get return request details, item conditions, and ledger movements',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Return details' },
        404: { description: 'Return request not found' },
      },
    },
  },
  '/api/v1/admin/returns/{id}/review': {
    post: {
      tags: ['Admin Returns'],
      summary: 'Initial review of customer return (APPROVE or REJECT)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['decision'],
              properties: {
                decision: { type: 'string', enum: ['APPROVE', 'REJECT'] },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Return decision recorded' },
      },
    },
  },
  '/api/v1/admin/returns/{id}/receive': {
    post: {
      tags: ['Admin Returns'],
      summary: 'Warehouse inspection of returned items with condition grading and restock',
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
                    required: ['returnItemId', 'condition', 'restockAction'],
                    properties: {
                      returnItemId: { type: 'string' },
                      condition: { type: 'string', enum: ['GOOD', 'DEFECTIVE', 'DAMAGED'] },
                      restockAction: { type: 'string', enum: ['RESTOCK', 'DISCARD', 'REPAIR'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Items received and restock movement ledger committed' },
      },
    },
  },
  '/api/v1/admin/returns/{id}/refund': {
    post: {
      tags: ['Admin Returns'],
      summary: 'Execute refund for approved return request with coupon discount deductions',
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
      responses: {
        200: { description: 'Refund executed successfully' },
      },
    },
  },
  '/api/v1/reasons': {
    get: {
      tags: ['Returns'],
      summary: 'List allowable reasons for customer returns',
      responses: {
        200: { description: 'Return reasons list' },
      },
    },
  },
  '/api/v1/orders/{id}/returns': {
    post: {
      tags: ['Returns'],
      summary: 'Customer initiates return request for delivered order (7-day window)',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason', 'items'],
              properties: {
                reason: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['orderItemId', 'quantity'],
                    properties: {
                      orderItemId: { type: 'string' },
                      quantity: { type: 'integer', minimum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: 'Return request submitted' },
        400: { description: 'Exceeded return window or invalid items' },
      },
    },
  },
  '/api/v1/orders/returns/my': {
    get: {
      tags: ['Returns'],
      summary: 'List returns requested by current authenticated customer',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Customer returns list' },
      },
    },
  },
  '/api/v1/admin/refunds': {
    get: {
      tags: ['Admin Refunds'],
      summary: 'List executed refunds with method, status and order correlation',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'Refunds list' },
      },
    },
  },
  '/api/v1/admin/refunds/{id}': {
    get: {
      tags: ['Admin Refunds'],
      summary: 'Get single refund details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Refund details' },
        404: { description: 'Refund not found' },
      },
    },
  },
  '/api/v1/admin/refunds/orders/{id}/refunds': {
    post: {
      tags: ['Admin Refunds'],
      summary: 'Issue manual refund against order under refunds route',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        201: { description: 'Refund issued' },
      },
    },
  },
  '/api/v1/admin/refunds/returns/{id}/refund': {
    post: {
      tags: ['Admin Refunds'],
      summary: 'Issue return refund under refunds route',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Refund issued' },
      },
    },
  },
  '/api/v1/admin/expenses/{id}': {
    get: {
      tags: ['Admin Operating Expenses'],
      summary: 'Get single operating expense details',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Expense details' },
        404: { description: 'Expense not found' },
      },
    },
    put: {
      tags: ['Admin Operating Expenses'],
      summary: 'Replace operating expense record',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['category', 'amount', 'title', 'incurredAt'],
              properties: {
                category: { type: 'string' },
                amount: { type: 'string' },
                title: { type: 'string' },
                incurredAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      responses: {
        200: { description: 'Expense updated' },
      },
    },
    patch: {
      tags: ['Admin Operating Expenses'],
      summary: 'Partially update operating expense',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Expense updated' },
      },
    },
    delete: {
      tags: ['Admin Operating Expenses'],
      summary: 'Delete operating expense record',
      security: [{ BearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        200: { description: 'Expense deleted' },
      },
    },
  },
  '/api/v1/notifications/unsubscribe': {
    get: {
      tags: ['Notifications'],
      summary: 'One-click unsubscribe verification page using signed token',
      parameters: [
        { name: 'token', in: 'query', required: true, schema: { type: 'string' } },
        { name: 'channel', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        200: { description: 'Unsubscribe preference recorded' },
        400: { description: 'Invalid or forged token' },
      },
    },
  },
  '/api/v1/notifications/read-all': {
    patch: {
      tags: ['Notifications'],
      summary: 'Mark all customer in-app notifications as read',
      security: [{ BearerAuth: [] }],
      responses: {
        200: { description: 'All notifications marked as read' },
      },
    },
  },
};
