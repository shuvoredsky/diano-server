-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ORDER_MANAGER', 'INVENTORY_MANAGER', 'SUPPORT_STAFF', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SSLCOMMERZ', 'BKASH', 'NAGAD', 'COD');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ITEM_RECEIVED', 'INSPECTED', 'REFUNDED', 'REPLACED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_ATTEMPT', 'RETURNED_TO_ORIGIN');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('ACTIVE', 'ABANDONED', 'RECOVERED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CheckoutEventType" AS ENUM ('CHECKOUT_STARTED', 'CUSTOMER_INFO_ENTERED', 'SHIPPING_INFO_ENTERED', 'PAYMENT_METHOD_SELECTED', 'CHECKOUT_STEP_COMPLETED', 'CHECKOUT_ABANDONED', 'ORDER_PLACED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT', 'ORDER_RESERVATION', 'ORDER_RELEASE', 'ORDER_FULFILLMENT', 'ORDER_CANCELLATION', 'RETURN_RESTOCK', 'DAMAGE_ADJUSTMENT', 'AUDIT_ADJUSTMENT', 'MANUAL_ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT');

-- CreateEnum
CREATE TYPE "FraudRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "FraudReviewStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'MANUAL_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('FIXED', 'PERCENTAGE', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'IN_APP', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('SHIPPING', 'BILLING');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "DeviceCategory" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductImageSlot" AS ENUM ('THUMBNAIL', 'BACKVIEW', 'GALLERY');

-- CreateEnum
CREATE TYPE "InventoryType" AS ENUM ('READY_STOCK', 'PRE_ORDER', 'MADE_TO_ORDER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "RoleType" NOT NULL DEFAULT 'CUSTOMER',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceCategory" "DeviceCategory" NOT NULL DEFAULT 'DESKTOP',
    "browser" TEXT,
    "os" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "replacedByTokenId" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AddressType" NOT NULL DEFAULT 'SHIPPING',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alternativePhone" TEXT,
    "addressLine" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "postalCode" TEXT,
    "landmark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "purpose" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "parentId" TEXT,
    "specificationTemplate" JSONB NOT NULL DEFAULT '[]',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "shortDescription" TEXT,
    "categoryId" TEXT NOT NULL,
    "videoUrl" TEXT,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "inventoryType" "InventoryType" NOT NULL DEFAULT 'READY_STOCK',
    "specifications" JSONB NOT NULL DEFAULT '{}',
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(12,2),
    "specialOffer" BOOLEAN NOT NULL DEFAULT false,
    "mrp" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "compareAtPrice" DECIMAL(12,2),
    "costPrice" DECIMAL(12,2),
    "reorderLevel" INTEGER NOT NULL DEFAULT 5,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "slot" "ProductImageSlot" NOT NULL DEFAULT 'GALLERY',
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "bytes" INTEGER,
    "altText" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttribute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "values" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "RelatedProduct" (
    "productId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,

    CONSTRAINT "RelatedProduct_pkey" PRIMARY KEY ("productId","relatedProductId")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "action" TEXT,
    "quantity" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "orderedAt" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "orderedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAudit" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "discrepanciesFound" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAuditItem" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "systemQuantity" INTEGER NOT NULL DEFAULT 0,
    "countedQuantity" INTEGER NOT NULL DEFAULT 0,
    "variance" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAuditItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceSnapshot" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "wishlistId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'ACTIVE',
    "cartSnapshot" JSONB NOT NULL,
    "checkoutValue" DECIMAL(12,2) NOT NULL,
    "lastCompletedStep" TEXT,
    "deviceCategory" "DeviceCategory" NOT NULL DEFAULT 'DESKTOP',
    "browser" TEXT,
    "ipAddress" TEXT,
    "consentStatus" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abandonedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutEvent" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "type" "CheckoutEventType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryAttempt" (
    "id" TEXT NOT NULL,
    "checkoutSessionId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentRecordId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "RecoveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "shippingTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentProvider" NOT NULL,
    "shippingAddressSnapshot" JSONB NOT NULL,
    "billingAddressSnapshot" JSONB,
    "customerSnapshot" JSONB NOT NULL,
    "couponId" TEXT,
    "notes" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "productName" TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2),
    "quantity" INTEGER NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "attributesSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT,
    "note" TEXT NOT NULL,
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "transactionId" TEXT,
    "providerReference" TEXT,
    "idempotencyKey" TEXT,
    "paymentFee" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawPayloadRedacted" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT true,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "processedById" TEXT,
    "providerRefundId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAssessment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" "FraudRiskLevel" NOT NULL,
    "triggeredRules" JSONB NOT NULL DEFAULT '[]',
    "factors" JSONB NOT NULL DEFAULT '{}',
    "explanation" TEXT,
    "reviewStatus" "FraudReviewStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudDecisionHistory" (
    "id" TEXT NOT NULL,
    "fraudAssessmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousStatus" "FraudReviewStatus" NOT NULL,
    "newStatus" "FraudReviewStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudDecisionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districts" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingMethod" (
    "id" TEXT NOT NULL,
    "shippingZoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "baseCharge" DECIMAL(12,2) NOT NULL,
    "perKgCharge" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "estimatedDays" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shippingMethodId" TEXT,
    "courierName" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "labelUrl" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" DECIMAL(12,2) NOT NULL,
    "minPurchase" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "maxDiscount" DECIMAL(12,2),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashSale" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashSaleItem" (
    "id" TEXT NOT NULL,
    "flashSaleId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "discountPrice" DECIMAL(12,2) NOT NULL,
    "stockLimit" INTEGER NOT NULL,
    "soldCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FlashSaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnReason" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "refundAmount" DECIMAL(12,2),
    "reasonId" TEXT,
    "customerNote" TEXT,
    "staffNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT,
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewImage" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailMarketing" BOOLEAN NOT NULL DEFAULT true,
    "smsMarketing" BOOLEAN NOT NULL DEFAULT true,
    "orderUpdates" BOOLEAN NOT NULL DEFAULT true,
    "promotionalPush" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailySummary" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metricKey" TEXT NOT NULL,
    "metricValue" DECIMAL(18,4) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductView" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_deletedAt_idx" ON "User"("status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");

-- CreateIndex
CREATE INDEX "Role_slug_idx" ON "Role"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_slug_key" ON "Permission"("slug");

-- CreateIndex
CREATE INDEX "Permission_resource_idx" ON "Permission"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_tokenHash_idx" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_idx" ON "LoginHistory"("userId");

-- CreateIndex
CREATE INDEX "LoginHistory_email_idx" ON "LoginHistory"("email");

-- CreateIndex
CREATE INDEX "LoginHistory_createdAt_idx" ON "LoginHistory"("createdAt");

-- CreateIndex
CREATE INDEX "OtpCode_identifier_purpose_idx" ON "OtpCode"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_tokenHash_idx" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId");

-- CreateIndex
CREATE INDEX "CustomerAddress_userId_idx" ON "CustomerAddress"("userId");

-- CreateIndex
CREATE INDEX "CustomerAddress_district_idx" ON "CustomerAddress"("district");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_purpose_idx" ON "ConsentRecord"("userId", "purpose");

-- CreateIndex
CREATE INDEX "ConsentRecord_guestEmail_purpose_idx" ON "ConsentRecord"("guestEmail", "purpose");

-- CreateIndex
CREATE INDEX "ConsentRecord_guestPhone_purpose_idx" ON "ConsentRecord"("guestPhone", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_slug_idx" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_isActive_deletedAt_idx" ON "Category"("isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_slug_idx" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_status_deletedAt_idx" ON "Product"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");

-- CreateIndex
CREATE INDEX "Product_inventoryType_idx" ON "Product"("inventoryType");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_barcode_key" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_isActive_deletedAt_idx" ON "ProductVariant"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_variantId_idx" ON "ProductImage"("variantId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_slot_idx" ON "ProductImage"("productId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_code_key" ON "ProductAttribute"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ProductTag_productId_idx" ON "ProductTag"("productId");

-- CreateIndex
CREATE INDEX "ProductTag_tagId_idx" ON "ProductTag"("tagId");

-- CreateIndex
CREATE INDEX "RelatedProduct_productId_idx" ON "RelatedProduct"("productId");

-- CreateIndex
CREATE INDEX "RelatedProduct_relatedProductId_idx" ON "RelatedProduct"("relatedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_code_idx" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Inventory_variantId_idx" ON "Inventory"("variantId");

-- CreateIndex
CREATE INDEX "Inventory_warehouseId_idx" ON "Inventory"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_variantId_warehouseId_key" ON "Inventory"("variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_warehouseId_idx" ON "StockMovement"("variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_code_idx" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_warehouseId_idx" ON "PurchaseOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_variantId_idx" ON "PurchaseOrderItem"("variantId");

-- CreateIndex
CREATE INDEX "StockAudit_warehouseId_idx" ON "StockAudit"("warehouseId");

-- CreateIndex
CREATE INDEX "StockAuditItem_auditId_idx" ON "StockAuditItem"("auditId");

-- CreateIndex
CREATE INDEX "StockAuditItem_variantId_idx" ON "StockAuditItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAuditItem_auditId_variantId_key" ON "StockAuditItem"("auditId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_guestToken_key" ON "Cart"("guestToken");

-- CreateIndex
CREATE INDEX "Cart_guestToken_idx" ON "Cart"("guestToken");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_key" ON "Wishlist"("userId");

-- CreateIndex
CREATE INDEX "WishlistItem_wishlistId_idx" ON "WishlistItem"("wishlistId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_variantId_key" ON "WishlistItem"("wishlistId", "productId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_sessionId_key" ON "CheckoutSession"("sessionId");

-- CreateIndex
CREATE INDEX "CheckoutSession_status_lastActivityAt_idx" ON "CheckoutSession"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_userId_idx" ON "CheckoutSession"("userId");

-- CreateIndex
CREATE INDEX "CheckoutSession_sessionId_idx" ON "CheckoutSession"("sessionId");

-- CreateIndex
CREATE INDEX "CheckoutEvent_checkoutSessionId_idx" ON "CheckoutEvent"("checkoutSessionId");

-- CreateIndex
CREATE INDEX "CheckoutEvent_type_idx" ON "CheckoutEvent"("type");

-- CreateIndex
CREATE INDEX "RecoveryAttempt_checkoutSessionId_idx" ON "RecoveryAttempt"("checkoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_placedAt_idx" ON "Order"("placedAt");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- CreateIndex
CREATE INDEX "OrderNote_orderId_idx" ON "OrderNote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_transactionId_key" ON "Payment"("provider", "transactionId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_eventId_key" ON "PaymentEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FraudRule_key_key" ON "FraudRule"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FraudAssessment_orderId_key" ON "FraudAssessment"("orderId");

-- CreateIndex
CREATE INDEX "FraudAssessment_riskLevel_idx" ON "FraudAssessment"("riskLevel");

-- CreateIndex
CREATE INDEX "FraudAssessment_reviewStatus_idx" ON "FraudAssessment"("reviewStatus");

-- CreateIndex
CREATE INDEX "FraudDecisionHistory_fraudAssessmentId_idx" ON "FraudDecisionHistory"("fraudAssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingMethod_code_key" ON "ShippingMethod"("code");

-- CreateIndex
CREATE INDEX "ShippingMethod_shippingZoneId_idx" ON "ShippingMethod"("shippingZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingNumber_key" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_idx" ON "ShipmentEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_shipmentId_idx" ON "DeliveryAttempt"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_idx" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_isActive_deletedAt_idx" ON "Coupon"("isActive", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_orderId_key" ON "CouponUsage"("orderId");

-- CreateIndex
CREATE INDEX "CouponUsage_userId_idx" ON "CouponUsage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_couponId_orderId_key" ON "CouponUsage"("couponId", "orderId");

-- CreateIndex
CREATE INDEX "FlashSale_isActive_startsAt_endsAt_idx" ON "FlashSale"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "FlashSaleItem_flashSaleId_idx" ON "FlashSaleItem"("flashSaleId");

-- CreateIndex
CREATE UNIQUE INDEX "FlashSaleItem_flashSaleId_variantId_key" ON "FlashSaleItem"("flashSaleId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnReason_code_key" ON "ReturnReason"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_returnNumber_key" ON "ReturnRequest"("returnNumber");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_customerId_idx" ON "ReturnRequest"("customerId");

-- CreateIndex
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");

-- CreateIndex
CREATE INDEX "ReturnItem_returnRequestId_idx" ON "ReturnItem"("returnRequestId");

-- CreateIndex
CREATE INDEX "ReturnItem_orderItemId_idx" ON "ReturnItem"("orderItemId");

-- CreateIndex
CREATE INDEX "Review_productId_status_idx" ON "Review"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_productId_key" ON "Review"("userId", "productId");

-- CreateIndex
CREATE INDEX "ReviewImage_reviewId_idx" ON "ReviewImage"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_channel_idx" ON "Notification"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "Setting_key_idx" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "AnalyticsDailySummary_metricKey_date_idx" ON "AnalyticsDailySummary"("metricKey", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailySummary_date_metricKey_key" ON "AnalyticsDailySummary"("date", "metricKey");

-- CreateIndex
CREATE INDEX "ProductView_productId_viewedAt_idx" ON "ProductView"("productId", "viewedAt");

-- CreateIndex
CREATE INDEX "ProductView_userId_idx" ON "ProductView"("userId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedProduct" ADD CONSTRAINT "RelatedProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedProduct" ADD CONSTRAINT "RelatedProduct_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAudit" ADD CONSTRAINT "StockAudit_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAuditItem" ADD CONSTRAINT "StockAuditItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "StockAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAuditItem" ADD CONSTRAINT "StockAuditItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutEvent" ADD CONSTRAINT "CheckoutEvent_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_checkoutSessionId_fkey" FOREIGN KEY ("checkoutSessionId") REFERENCES "CheckoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryAttempt" ADD CONSTRAINT "RecoveryAttempt_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "ConsentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAssessment" ADD CONSTRAINT "FraudAssessment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudDecisionHistory" ADD CONSTRAINT "FraudDecisionHistory_fraudAssessmentId_fkey" FOREIGN KEY ("fraudAssessmentId") REFERENCES "FraudAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_shippingZoneId_fkey" FOREIGN KEY ("shippingZoneId") REFERENCES "ShippingZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashSaleItem" ADD CONSTRAINT "FlashSaleItem_flashSaleId_fkey" FOREIGN KEY ("flashSaleId") REFERENCES "FlashSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashSaleItem" ADD CONSTRAINT "FlashSaleItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "ReturnReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "ReturnRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewImage" ADD CONSTRAINT "ReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==============================================================================
-- CUSTOM HIGH-INTEGRITY CONSTRAINTS, PARTIAL INDEXES & TRIGGERS
-- ==============================================================================

-- 1. Inventory Integrity & Stock Definitions
ALTER TABLE "Inventory"
  ADD CONSTRAINT "chk_inventory_on_hand_non_negative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "chk_inventory_reserved_non_negative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "chk_inventory_damaged_non_negative" CHECK ("damaged" >= 0),
  ADD CONSTRAINT "chk_inventory_safety_stock_non_negative" CHECK ("safetyStock" >= 0),
  ADD CONSTRAINT "chk_inventory_available_stock_non_negative" CHECK (("onHand" - "reserved" - "damaged") >= 0);

-- 2. Review Rating Boundaries (1 to 5)
ALTER TABLE "Review"
  ADD CONSTRAINT "chk_review_rating_1_to_5" CHECK ("rating" >= 1 AND "rating" <= 5);

-- 3. Fraud Scoring Boundaries (0 to 100)
ALTER TABLE "FraudAssessment"
  ADD CONSTRAINT "chk_fraud_risk_score_0_to_100" CHECK ("riskScore" >= 0 AND "riskScore" <= 100);

-- 4. Monetary Positivity & Non-Negativity
ALTER TABLE "Product"
  ADD CONSTRAINT "chk_product_mrp_positive" CHECK ("mrp" > 0),
  ADD CONSTRAINT "chk_product_discount_value_non_negative" CHECK ("discountValue" >= 0);

ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "chk_variant_price_positive" CHECK ("price" >= 0),
  ADD CONSTRAINT "chk_variant_cost_price_positive" CHECK ("costPrice" IS NULL OR "costPrice" >= 0);

ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_grand_total_positive" CHECK ("grandTotal" >= 0);

ALTER TABLE "Payment"
  ADD CONSTRAINT "chk_payment_amount_positive" CHECK ("amount" > 0);

-- 5. Product Image Slot Constraints (Partial Unique Indexes for 1 THUMBNAIL and 1 BACKVIEW per product)
CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_single_thumbnail"
  ON "ProductImage" ("productId")
  WHERE "slot" = 'THUMBNAIL';

CREATE UNIQUE INDEX IF NOT EXISTS "idx_product_single_backview"
  ON "ProductImage" ("productId")
  WHERE "slot" = 'BACKVIEW';

-- 6. Full-Text & Trigram Fuzzy Search (pg_trgm extension for catalog ILIKE search acceleration)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "idx_product_name_trgm" ON "Product" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_product_description_trgm" ON "Product" USING gin ("description" gin_trgm_ops);

-- 7. StockMovement Append-Only Immutability Trigger (Prohibits UPDATE & DELETE at PostgreSQL engine level)
CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is an immutable append-only ledger: UPDATE and DELETE operations are strictly prohibited.'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_stock_movement_mutation ON "StockMovement";
CREATE TRIGGER trg_block_stock_movement_mutation
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_stock_movement_mutation();

-- 8. Purchase Order Procurement Integrity (Over-receive blocking & non-negative costs)
ALTER TABLE "PurchaseOrderItem"
  ADD CONSTRAINT "chk_po_item_ordered_qty_positive" CHECK ("orderedQuantity" > 0),
  ADD CONSTRAINT "chk_po_item_received_qty_bounds" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "orderedQuantity"),
  ADD CONSTRAINT "chk_po_item_unit_cost_non_negative" CHECK ("unitCost" >= 0);

-- 9. Stock Audit Item Boundaries
ALTER TABLE "StockAuditItem"
  ADD CONSTRAINT "chk_stock_audit_system_qty_non_negative" CHECK ("systemQuantity" >= 0),
  ADD CONSTRAINT "chk_stock_audit_counted_qty_non_negative" CHECK ("countedQuantity" >= 0);

