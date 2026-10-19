-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'TEXT', 'INT', 'DECIMAL', 'BOOLEAN', 'ENUM', 'JSON', 'MONEY_MINOR', 'DURATION_SECONDS', 'COLOR', 'URL', 'EMAIL', 'PHONE', 'MEDIA_REF', 'SECRET_REF', 'LOCALIZED_TEXT');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('INSTALLATION', 'STORE', 'INHERITED');

-- CreateEnum
CREATE TYPE "SettingChangeAction" AS ENUM ('SET', 'RESET_TO_DEFAULT', 'MIGRATION_ADDED', 'COPIED_FROM_STORE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "OwnerDataKind" AS ENUM ('TABLE', 'SETTING_KEY', 'SETTING_PREFIX', 'MEDIA_FOLDER');

-- CreateEnum
CREATE TYPE "SecretAccessAction" AS ENUM ('CREATE', 'REPLACE', 'ROTATE', 'REVOKE', 'DECRYPT', 'TEST');

-- CreateEnum
CREATE TYPE "StaffUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'NEW_DEVICE', 'ADDRESS_REVEAL', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('COURIER', 'SMS', 'EMAIL', 'PAYMENT', 'AI_PROVIDER', 'META', 'GOOGLE', 'YOUTUBE', 'TIKTOK', 'WHATSAPP', 'MESSENGER', 'TELEGRAM', 'GOOGLE_DRIVE', 'STORAGE', 'CDN', 'ERP', 'FRAUD_CHECK', 'MAPS', 'SEARCH_CONSOLE', 'OTHER');

-- CreateEnum
CREATE TYPE "AdapterMode" AS ENUM ('MOCK', 'SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "WasPriceSource" AS ENUM ('NONE', 'MRP', 'PRICE_HISTORY', 'COMBO', 'LAUNCH_PRICE');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'READY_TO_PUBLISH', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'PDF', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL_DISK', 'AZURE_BLOB', 'S3_COMPATIBLE', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "ProductMediaRole" AS ENUM ('FRONT', 'BACK', 'DETAIL', 'ON_MODEL', 'FLAT_LAY', 'FABRIC', 'TRUE_COLOUR', 'SET', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('MANUAL', 'SEASONAL', 'RULE');

-- CreateEnum
CREATE TYPE "CatalogJobKind" AS ENUM ('IMPORT_FROM_LINK', 'CSV_IMPORT', 'CSV_EXPORT');

-- CreateEnum
CREATE TYPE "BackgroundStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('HOME', 'CONTENT', 'LANDING', 'SEASONAL', 'HELP', 'BLOG_HOME', 'SETS_LANDING');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LayoutScope" AS ENUM ('PAGE', 'HOME', 'ALL_CATEGORIES', 'CATEGORY', 'PRODUCT_PAGE', 'CHECKOUT', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "DeviceTarget" AS ENUM ('BOTH', 'PHONE', 'DESKTOP');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "AbTestStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ComboType" AS ENUM ('FIXED_SET', 'COLOUR_PAIR', 'TOP_BOTTOM', 'MIXED_SET', 'FIXED_COLOUR_PACK', 'BUILD_YOUR_OWN');

-- CreateEnum
CREATE TYPE "ComboStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'SOLD_OUT', 'ENDED');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED', 'MERGED');

-- CreateEnum
CREATE TYPE "AdvanceRequirement" AS ENUM ('NONE', 'DELIVERY_CHARGE', 'FULL_AMOUNT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'ON_HOLD', 'PROCESSING', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('DELIVERY', 'PICKUP', 'COUNTER');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEBSITE', 'LANDING_PAGE', 'MESSENGER', 'WHATSAPP', 'LIVE_CHAT', 'PHONE', 'TELEGRAM', 'ADMIN', 'SHOWROOM', 'IMPORT');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('ACTIVE', 'REMOVED', 'HELD_DAMAGED', 'HELD_NOT_FOUND', 'CANCELLED', 'EXCHANGED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('STAFF', 'CUSTOMER', 'AI_AGENT', 'SYSTEM', 'COURIER', 'ERP');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'TELEGRAM', 'PUSH', 'MESSENGER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED', 'BLOCKED_BY_GUARD');

-- CreateEnum
CREATE TYPE "GeoLevel" AS ENUM ('DIVISION', 'DISTRICT', 'UPAZILA', 'THANA', 'AREA');

-- CreateEnum
CREATE TYPE "IdentityKind" AS ENUM ('PHONE', 'NAME', 'ADDRESS', 'EMAIL', 'IP', 'DEVICE', 'MESSENGER_PSID', 'WHATSAPP_ID');

-- CreateEnum
CREATE TYPE "FraudRuleAction" AS ENUM ('CANCEL', 'HOLD', 'WARN', 'ALLOW');

-- CreateEnum
CREATE TYPE "FraudAlertStatus" AS ENUM ('OPEN', 'APPROVED', 'DECLINED', 'OVERRIDDEN', 'AUTO_RESOLVED');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('PROPOSED', 'BLOCKED', 'REJECTED', 'UNBLOCKED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'BKASH', 'NAGAD', 'CARD', 'CASH', 'WALLET', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('ORDER', 'ADVANCE_DELIVERY_CHARGE', 'FULL_ADVANCE', 'EXCHANGE_DIFFERENCE', 'PREORDER_ADVANCE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('BOOKING', 'IN_REVIEW', 'PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PARTIALLY_DELIVERED', 'RETURNING', 'RETURNED', 'CANCELLED', 'BOOKING_FAILED');

-- CreateEnum
CREATE TYPE "ExchangeStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PICKUP_BOOKED', 'RECEIVED', 'QC_PASSED', 'QC_FAILED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QcStatus" AS ENUM ('GOOD', 'B_GRADE', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReturnKind" AS ENUM ('REFUSED_AT_DOOR', 'RETURNED', 'CHARGE_PAID_RETURN', 'DEFECT_RETURN');

-- CreateEnum
CREATE TYPE "ErpMode" AS ENUM ('EXTAS_ERP', 'OTHER_ERP', 'NONE');

-- CreateEnum
CREATE TYPE "LocationKind" AS ENUM ('WAREHOUSE', 'SHOWROOM', 'IN_TRANSIT', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ErpPushStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED_NO_ERP');

-- CreateEnum
CREATE TYPE "SmartRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('IDEA', 'BRIEFED', 'DRAFT', 'PROOFREAD', 'FACT_CHECKED', 'SEO_CHECKED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'GOOGLE', 'YOUTUBE', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'STICKER', 'PICKING_LIST', 'HANDOVER_SHEET', 'THERMAL_RECEIPT', 'LETTERHEAD', 'WHATSAPP_INVOICE_IMAGE');

-- CreateEnum
CREATE TYPE "StudioJobStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'REVIEW_REQUIRED', 'APPROVED', 'PUBLISHED', 'REJECTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Installation" (
    "id" UUID NOT NULL,
    "settingsVersion" INTEGER NOT NULL DEFAULT 0,
    "appVersion" TEXT,
    "installedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setupCompletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StoreStatus" NOT NULL DEFAULT 'DRAFT',
    "isPrimary" BOOLEAN,
    "defaultLocale" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "erpCompanyId" TEXT,
    "setupState" JSONB,
    "launchedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingDefinition" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "valueType" "SettingValueType" NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "defaultValue" JSONB,
    "constraints" JSONB,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT NOT NULL,
    "helpEn" TEXT,
    "helpBn" TEXT,
    "isOwnerData" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "requiresOwnerOk" BOOLEAN NOT NULL DEFAULT false,
    "sinceVersion" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deprecatedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SettingDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationSettingValue" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstallationSettingValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSettingValue" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreSettingValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingChange" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "key" TEXT NOT NULL,
    "action" "SettingChangeAction" NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettingsMigration" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "addedKeys" TEXT[],
    "changedKeys" TEXT[],
    "appliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingsMigration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerDataEntry" (
    "id" UUID NOT NULL,
    "kind" "OwnerDataKind" NOT NULL,
    "target" TEXT NOT NULL,
    "reasonEn" TEXT NOT NULL,
    "reasonBn" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OwnerDataEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefaultPackApplication" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "packKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summary" JSONB,
    "appliedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefaultPackApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultKey" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL,
    "masterKeyRef" TEXT NOT NULL,
    "wrappedDataKey" BYTEA NOT NULL,
    "activatedAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VaultKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationSecret" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "rotatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstallationSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSecret" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdById" UUID,
    "updatedById" UUID,
    "rotatedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretAccessLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "secretName" TEXT NOT NULL,
    "action" "SecretAccessAction" NOT NULL,
    "service" TEXT NOT NULL,
    "purpose" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSetAt" TIMESTAMPTZ(3),
    "totpCiphertext" BYTEA,
    "totpIv" BYTEA,
    "totpAuthTag" BYTEA,
    "totpKeyVersion" INTEGER,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "adminLocale" TEXT,
    "status" "StaffUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSession" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "activeStoreId" INTEGER,
    "lastSeenAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLoginEvent" (
    "id" UUID NOT NULL,
    "staffUserId" UUID,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffLoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionBn" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "StaffRoleAssignment" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "storeId" INTEGER,
    "grantedById" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminIpAllowlistEntry" (
    "id" UUID NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminIpAllowlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCredential" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSetAt" TIMESTAMPTZ(3),
    "mustChange" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSession" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "kind" "IntegrationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "AdapterMode" NOT NULL DEFAULT 'MOCK',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "secretNames" TEXT[],
    "lastTestAt" TIMESTAMPTZ(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationTestRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "integrationId" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "lockedUntil" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "scheduleSettingKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMPTZ(3),
    "nextRunAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "jobKey" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOwnLabel" BOOLEAN NOT NULL DEFAULT false,
    "logoAssetId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentType" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "measurementFields" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GarmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "parentId" UUID,
    "garmentTypeId" UUID,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "introEn" TEXT,
    "introBn" TEXT,
    "imageAssetId" UUID,
    "templateKey" TEXT,
    "wasPriceSource" "WasPriceSource",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleGroup" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "parentId" UUID,
    "level" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "ancestorIds" UUID[],
    "name" TEXT NOT NULL,
    "erpStyleCode" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StyleGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "brandId" UUID,
    "categoryId" UUID,
    "styleGroupId" UUID,
    "fabricId" UUID,
    "erpStyleCode" TEXT,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "feedTitle" TEXT,
    "descriptionEn" TEXT,
    "descriptionBn" TEXT,
    "careEn" TEXT,
    "careBn" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT,
    "firstScreenStyle" TEXT,
    "pdpBlocks" JSONB,
    "freeDelivery" BOOLEAN,
    "wasPriceSource" "WasPriceSource",
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "healthIssues" JSONB,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "minPriceMinor" INTEGER,
    "sortRank" INTEGER NOT NULL DEFAULT 0,
    "hasAiImagery" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "unpublishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colour" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "hex" TEXT NOT NULL,
    "family" TEXT,
    "synonyms" TEXT[],
    "trueColourAssetId" UUID,
    "erpColorCode" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Colour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Size" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "erpSizeCode" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Size_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "colourId" UUID,
    "sizeId" UUID,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "erpVariantId" TEXT,
    "erpRetailPriceMinor" INTEGER,
    "avgCostMinor" INTEGER,
    "bGradeAvgCostMinor" INTEGER,
    "priceMinor" INTEGER,
    "compareAtMinor" INTEGER,
    "weightGrams" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "erpUpdatedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "variantId" UUID NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "compareAtMinor" INTEGER,
    "source" TEXT NOT NULL,
    "actorId" UUID,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductColour" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "colourId" UUID NOT NULL,
    "noteEn" TEXT,
    "noteBn" TEXT,
    "trueColourAssetId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductColour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage" "StorageProvider" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "dominantColor" TEXT,
    "checksumSha256" TEXT NOT NULL,
    "isOriginal" BOOLEAN NOT NULL DEFAULT true,
    "sourceAssetId" UUID,
    "role" TEXT,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sharedWithAllStores" BOOLEAN NOT NULL DEFAULT false,
    "altEn" TEXT,
    "altBn" TEXT,
    "folder" TEXT,
    "tags" TEXT[],
    "uploadedById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaRendition" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "assetId" UUID NOT NULL,
    "preset" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "quality" INTEGER,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaRendition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMedia" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "colourId" UUID,
    "role" "ProductMediaRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeChart" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "garmentTypeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fitKey" TEXT,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SizeChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeChartAssignment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "sizeChartId" UUID NOT NULL,
    "categoryId" UUID,
    "productId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SizeChartAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fabric" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "composition" JSONB,
    "gsm" INTEGER,
    "careEn" TEXT,
    "careBn" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "kind" "CollectionKind" NOT NULL,
    "rules" JSONB,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "collectionId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "tagId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "CatalogJobKind" NOT NULL,
    "sourceUrl" TEXT,
    "fileAssetId" UUID,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsOk" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "createdById" UUID,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CatalogImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishQueueItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'OPEN',
    "checklist" JSONB,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PublishQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackInStockRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "customerId" UUID,
    "phone" TEXT,
    "email" TEXT,
    "notifiedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BackInStockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRename" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "oldName" TEXT,
    "newName" TEXT,
    "oldSlug" TEXT,
    "newSlug" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRename_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryProduct" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "inStock" BOOLEAN NOT NULL DEFAULT false,
    "sortRank" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategoryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "PageKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleBn" TEXT,
    "bodyEn" TEXT,
    "bodyBn" TEXT,
    "templateKey" TEXT,
    "campaignId" UUID,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "bnReadyAt" TIMESTAMPTZ(3),
    "recurrence" JSONB,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageSection" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "pageId" UUID,
    "layoutScope" "LayoutScope" NOT NULL,
    "categoryId" UUID,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "device" "DeviceTarget" NOT NULL DEFAULT 'BOTH',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SideCanvasZone" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "side" TEXT NOT NULL,
    "pageScope" JSONB NOT NULL,
    "type" TEXT NOT NULL,
    "placement" JSONB NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SideCanvasZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutSnapshot" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isLaunchDefault" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LayoutSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayoutRestore" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "snapshotId" UUID NOT NULL,
    "previousPayload" JSONB NOT NULL,
    "undoOfId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LayoutRestore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "payload" JSONB NOT NULL,
    "checks" JSONB,
    "authorId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "menuId" UUID NOT NULL,
    "parentId" UUID,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT,
    "linkType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "device" "DeviceTarget" NOT NULL DEFAULT 'BOTH',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Theme" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "scheduledFrom" TIMESTAMPTZ(3),
    "scheduledTo" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "namespace" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "bn" TEXT,
    "defaultEn" TEXT NOT NULL,
    "defaultBn" TEXT,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LabelEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbTest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AbTestStatus" NOT NULL DEFAULT 'DRAFT',
    "variants" JSONB NOT NULL,
    "split" JSONB NOT NULL,
    "goalEvent" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AbTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbAssignment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "testId" UUID NOT NULL,
    "visitorId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID,
    "comboId" UUID,
    "orderItemId" UUID,
    "customerId" UUID,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "displayName" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "reply" TEXT,
    "repliedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewMedia" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "reviewId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReviewMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductQuestion" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "customerId" UUID,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" UUID,
    "answeredAt" TIMESTAMPTZ(3),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID,
    "visitorId" TEXT,
    "productId" UUID NOT NULL,
    "colourId" UUID,
    "variantId" UUID,
    "alertOptIn" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeAdviceModel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "garmentTypeId" UUID NOT NULL,
    "fitKey" TEXT,
    "version" INTEGER NOT NULL,
    "model" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SizeAdviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeRecommendation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "modelVersion" INTEGER,
    "heightCm" INTEGER NOT NULL,
    "weightKg" INTEGER NOT NULL,
    "recommendedSizeId" UUID,
    "chosenSizeId" UUID,
    "orderItemId" UUID,
    "exchangedForSize" BOOLEAN,
    "reasoning" JSONB,
    "visitorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizeRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchSynonym" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "locale" TEXT NOT NULL,
    "terms" TEXT[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchSynonym_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CachePurgeLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "reason" TEXT NOT NULL,
    "targets" JSONB NOT NULL,
    "layers" TEXT[],
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachePurgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combo" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "autoRuleId" UUID,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "type" "ComboType" NOT NULL,
    "pieceCount" INTEGER NOT NULL,
    "listTemplateKey" TEXT,
    "pageTemplateKey" TEXT,
    "bagTemplateKey" TEXT,
    "setPriceMinor" INTEGER,
    "compareAtMinor" INTEGER,
    "status" "ComboStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "colourOrderKey" TEXT,
    "setPhotoAssetId" UUID,
    "sortRank" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "comboId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" UUID,
    "categoryId" UUID,
    "fixedVariantId" UUID,
    "allowedColourIds" UUID[],
    "allowedSizeIds" UUID[],
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboAutoRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceIds" UUID[],
    "pieces" INTEGER NOT NULL,
    "priceMinor" INTEGER,
    "compareAtMinor" INTEGER,
    "noSinglePiece" BOOLEAN NOT NULL DEFAULT false,
    "addOneMore" BOOLEAN NOT NULL DEFAULT false,
    "status" "ComboStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ComboAutoRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetTierRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "ComboStatus" NOT NULL DEFAULT 'DRAFT',
    "showInBag" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SetTierRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetTier" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "ruleId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SetTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularPair" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "comboId" UUID NOT NULL,
    "colourIds" UUID[],
    "rank" INTEGER NOT NULL DEFAULT 0,
    "pickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PopularPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboTemplateScore" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,
    "matrixKey" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComboTemplateScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID,
    "visitorId" TEXT NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "couponCode" TEXT,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedOrderId" UUID,
    "mergedIntoId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "comboId" UUID,
    "comboGroupKey" TEXT,
    "setPriceMinor" INTEGER,
    "savedForLater" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "label" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "areaId" UUID,
    "postcode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutDraft" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "cartId" UUID,
    "customerId" UUID,
    "visitorId" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "email" TEXT,
    "addressText" TEXT,
    "areaId" UUID,
    "data" JSONB,
    "lastStep" TEXT,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedOrderId" UUID,
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutParameterLayer" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "requirement" "AdvanceRequirement" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutParameterLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutFlagEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "layerId" UUID,
    "checkoutDraftId" UUID,
    "orderId" UUID,
    "customerId" UUID,
    "requirement" "AdvanceRequirement" NOT NULL,
    "outcome" TEXT NOT NULL,
    "explanation" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutFlagEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
    "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'DELIVERY',
    "source" "OrderSource" NOT NULL,
    "currency" TEXT NOT NULL,
    "placedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT,
    "customerName" TEXT,
    "email" TEXT,
    "shippingAddressText" TEXT,
    "backfilledAddress" TEXT,
    "areaId" UUID,
    "deliveryBandId" UUID,
    "addressResolution" JSONB,
    "addressUnclear" BOOLEAN NOT NULL DEFAULT false,
    "chargeFixed" BOOLEAN NOT NULL DEFAULT false,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "deliveryChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "walletAppliedMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "codAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "paidMinor" INTEGER NOT NULL DEFAULT 0,
    "advanceRequirement" "AdvanceRequirement" NOT NULL DEFAULT 'NONE',
    "paymentMethod" "PaymentMethod",
    "couponCode" TEXT,
    "riskScore" INTEGER,
    "riskBand" TEXT,
    "riskSection" TEXT,
    "holdReason" TEXT,
    "onHoldSince" TIMESTAMPTZ(3),
    "cancelReasonCode" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "packedAt" TIMESTAMPTZ(3),
    "handedOverAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "returnedAt" TIMESTAMPTZ(3),
    "courierAccountId" UUID,
    "orderGroupId" UUID,
    "twoSizeStatus" TEXT,
    "customerEditCount" INTEGER NOT NULL DEFAULT 0,
    "smsMarketingConsent" BOOLEAN,
    "whatsappMarketingConsent" BOOLEAN,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "adPlatform" TEXT,
    "adCampaignId" UUID,
    "landingPageId" UUID,
    "supportRefCode" TEXT,
    "referrer" TEXT,
    "visitorId" TEXT,
    "ip" TEXT,
    "deviceId" TEXT,
    "gpsLat" DECIMAL(9,6),
    "gpsLng" DECIMAL(9,6),
    "piiExpiresAt" TIMESTAMPTZ(3),
    "idempotencyKey" TEXT NOT NULL,
    "erpOrderId" TEXT,
    "erpSyncStatus" TEXT,
    "shipAfter" TIMESTAMPTZ(3),
    "note" TEXT,
    "flags" TEXT[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID,
    "productId" UUID,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "colourName" TEXT,
    "sizeLabel" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "compareAtMinor" INTEGER,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL,
    "unitCostMinor" INTEGER,
    "comboId" UUID,
    "comboGroupKey" TEXT,
    "isAddOn" BOOLEAN NOT NULL DEFAULT false,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "addedVia" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "message" TEXT,
    "data" JSONB,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNote" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "authorId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderGroup" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTask" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID,
    "customerId" UUID,
    "reason" TEXT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" UUID,
    "agentKey" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "outcome" TEXT,
    "notes" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CallTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "providerTemplateId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID,
    "customerId" UUID,
    "broadcastId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "templateId" UUID,
    "recipient" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "dedupeKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "costMinor" INTEGER,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoArea" (
    "id" UUID NOT NULL,
    "level" "GeoLevel" NOT NULL,
    "parentId" UUID,
    "ancestorIds" UUID[],
    "code" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "aliases" TEXT[],
    "postcodes" TEXT[],
    "cityCorporation" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeoArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryBand" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "chargeMinor" INTEGER NOT NULL,
    "codLimitMinor" INTEGER,
    "hoursMin" INTEGER,
    "hoursMax" INTEGER,
    "mode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaBand" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "areaId" UUID NOT NULL,
    "bandId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AreaBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierAreaMapping" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "courierCityId" TEXT,
    "courierZoneId" TEXT,
    "courierAreaId" TEXT,
    "syncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierAreaMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityCluster" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "primaryCustomerId" UUID,
    "confidence" DOUBLE PRECISION,
    "mergedIntoId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdentityCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityLink" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "clusterId" UUID NOT NULL,
    "kind" "IdentityKind" NOT NULL,
    "valueNorm" TEXT NOT NULL,
    "orderId" UUID,
    "confidence" DOUBLE PRECISION,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSignalConfig" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT,
    "weight" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskSignalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskBand" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT,
    "minScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID,
    "checkoutDraftId" UUID,
    "phone" TEXT,
    "score" INTEGER NOT NULL,
    "bandKey" TEXT,
    "signals" JSONB NOT NULL,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "scenario" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "windowHours" INTEGER,
    "confidenceThreshold" INTEGER,
    "action" "FraudRuleAction" NOT NULL,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudAlert" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "ruleId" UUID,
    "orderId" UUID NOT NULL,
    "matchedOrderIds" UUID[],
    "severity" TEXT,
    "confidence" INTEGER,
    "proposedAction" "FraudRuleAction" NOT NULL,
    "status" "FraudAlertStatus" NOT NULL DEFAULT 'OPEN',
    "summary" JSONB,
    "decidedById" UUID,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FraudAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudDecision" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "alertId" UUID,
    "orderId" UUID,
    "decision" TEXT NOT NULL,
    "reason" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "identityClusterId" UUID,
    "customerId" UUID,
    "phone" TEXT,
    "status" "BlockStatus" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT NOT NULL,
    "nameGiven" TEXT,
    "addressGiven" TEXT,
    "productsOrdered" JSONB,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "proposedByAgent" TEXT,
    "proposedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedById" UUID,
    "blockedAt" TIMESTAMPTZ(3),
    "unblockedById" UUID,
    "unblockedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierFraudCheck" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "deliveredCount" INTEGER,
    "cancelledCount" INTEGER,
    "result" JSONB,
    "ok" BOOLEAN NOT NULL,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierFraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateNoticeEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "existingOrderId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "differentSize" BOOLEAN NOT NULL DEFAULT false,
    "action" TEXT NOT NULL,
    "campaignRef" TEXT,
    "utm" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateNoticeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT,
    "purpose" "PaymentPurpose" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "gatewayFeeMinor" INTEGER,
    "providerRef" TEXT,
    "providerTrxId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "reconciliationStatus" TEXT,
    "reconciledAt" TIMESTAMPTZ(3),
    "erpSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID,
    "paymentId" UUID,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "sentVia" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettlement" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "periodFrom" TIMESTAMPTZ(3),
    "periodTo" TIMESTAMPTZ(3),
    "totalCodMinor" INTEGER NOT NULL,
    "chargesMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "receivedAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierSettlementLine" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "settlementId" UUID NOT NULL,
    "orderId" UUID,
    "shipmentId" UUID,
    "consignmentId" TEXT,
    "codMinor" INTEGER NOT NULL,
    "chargeMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierSettlementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "walletId" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "balanceAfterMinor" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" UUID,
    "exchangeId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvalRequestId" UUID,
    "requestedById" UUID,
    "approvedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayStatement" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "periodFrom" TIMESTAMPTZ(3) NOT NULL,
    "periodTo" TIMESTAMPTZ(3) NOT NULL,
    "fileAssetId" UUID,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GatewayStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayStatementLine" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "statementId" UUID NOT NULL,
    "providerTrxId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER,
    "occurredAt" TIMESTAMPTZ(3),
    "matchedPaymentId" UUID,
    "matchStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GatewayStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierAccount" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "providerKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierRateCard" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "weightFromGrams" INTEGER NOT NULL,
    "weightToGrams" INTEGER NOT NULL,
    "chargeMinor" INTEGER NOT NULL,
    "codFeeBps" INTEGER,
    "returnChargeMinor" INTEGER,
    "validFrom" TIMESTAMPTZ(3) NOT NULL,
    "validTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierRateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "consignmentId" TEXT,
    "trackingCode" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'BOOKING',
    "providerStatus" TEXT,
    "chargeMinor" INTEGER,
    "codAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "codCollectedMinor" INTEGER,
    "weightGrams" INTEGER,
    "isExchangeLeg" BOOLEAN NOT NULL DEFAULT false,
    "exchangeId" UUID,
    "labelPrintCount" INTEGER NOT NULL DEFAULT 0,
    "bookedAt" TIMESTAMPTZ(3),
    "pickedAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "returnedAt" TIMESTAMPTZ(3),
    "idempotencyKey" TEXT NOT NULL,
    "erpSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "shipmentId" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "rawStatus" TEXT,
    "message" TEXT,
    "riderNote" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "orderIds" UUID[],
    "isReprint" BOOLEAN NOT NULL DEFAULT false,
    "documentId" UUID,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "actorId" UUID,
    "printedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverBatch" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "courierAccountId" UUID NOT NULL,
    "shipmentIds" UUID[],
    "handedOverAt" TIMESTAMPTZ(3),
    "receivedBy" TEXT,
    "documentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HandoverBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingIssue" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "resolution" TEXT,
    "markedById" UUID,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "badStockPushedAt" TIMESTAMPTZ(3),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PackingIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exchange" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID,
    "number" TEXT NOT NULL,
    "status" "ExchangeStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "isOurMistake" BOOLEAN NOT NULL DEFAULT false,
    "priceDifferenceMinor" INTEGER NOT NULL DEFAULT 0,
    "deliveryChargeMinor" INTEGER NOT NULL DEFAULT 0,
    "walletCreditMinor" INTEGER NOT NULL DEFAULT 0,
    "codToCollectMinor" INTEGER NOT NULL DEFAULT 0,
    "photoAssetIds" UUID[],
    "windowEndsAt" TIMESTAMPTZ(3),
    "newOrderId" UUID,
    "qcById" UUID,
    "qcAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "erpSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "exchangeId" UUID NOT NULL,
    "originalOrderItemId" UUID NOT NULL,
    "newVariantId" UUID,
    "quantity" INTEGER NOT NULL,
    "qcStatus" "QcStatus",
    "restockAction" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExchangeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "shipmentId" UUID,
    "customerId" UUID,
    "kind" "ReturnKind" NOT NULL,
    "reasonCode" TEXT,
    "riderNote" TEXT,
    "chargePaidMinor" INTEGER NOT NULL DEFAULT 0,
    "courierClaim" TEXT,
    "actualOutcome" TEXT,
    "mismatch" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMPTZ(3),
    "erpSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnItem" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "returnId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "qcStatus" "QcStatus",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeMismatch" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "chargedBandKey" TEXT NOT NULL,
    "courierResolvedArea" TEXT,
    "differenceMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayPeriod" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "checkoutMode" TEXT NOT NULL,
    "shipAfter" TIMESTAMPTZ(3),
    "bannerEn" TEXT,
    "bannerBn" TEXT,
    "pauseAds" BOOLEAN NOT NULL DEFAULT false,
    "pauseSms" BOOLEAN NOT NULL DEFAULT false,
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HolidayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreErpMapping" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "mode" "ErpMode" NOT NULL DEFAULT 'NONE',
    "integrationId" UUID,
    "erpCompanyId" TEXT,
    "erpWarehouseId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreErpMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "erpWarehouseId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LocationKind" NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "cartReserved" INTEGER NOT NULL DEFAULT 0,
    "erpUpdatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReservation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID,
    "quantity" INTEGER NOT NULL,
    "cartId" UUID,
    "orderId" UUID,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "erpRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LowStockAlert" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "threshold" INTEGER NOT NULL,
    "available" INTEGER NOT NULL,
    "notifiedAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LowStockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAudit" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "startedById" UUID,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAuditLine" (
    "id" UUID NOT NULL,
    "auditId" UUID NOT NULL,
    "variantId" UUID,
    "barcode" TEXT NOT NULL,
    "expectedQty" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StockAuditLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSyncState" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedSince" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpSyncRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "BackgroundStatus" NOT NULL,
    "itemsOk" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpPush" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ErpPushStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestBody" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "erpId" TEXT,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalStockIntake" (
    "id" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostMinor" INTEGER,
    "supplierName" TEXT,
    "enteredById" UUID,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalStockIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "SmartRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SmartRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartRuleVersion" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "ruleId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changeNote" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartRuleConflict" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "ruleAId" UUID NOT NULL,
    "ruleBId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SmartRuleConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartRuleSimulation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "ruleId" UUID,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmartRuleSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "placement" JSONB NOT NULL,
    "timing" JSONB,
    "contentEn" TEXT NOT NULL,
    "contentBn" TEXT,
    "ruleId" UUID,
    "frequencyCap" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoMeta" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "canonicalUrl" TEXT,
    "robots" TEXT,
    "ogImageAssetId" UUID,
    "structuredData" JSONB,
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "bnReadyAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SeoMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoTemplate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "pageType" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT,
    "slugTemplate" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SeoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMPTZ(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keepUntil" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotFoundHit" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "referrer" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redirectId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotFoundHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitemapBuild" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "urlCount" INTEGER NOT NULL,
    "fileAssetId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitemapBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterIndexRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "categoryId" UUID NOT NULL,
    "filterKey" TEXT NOT NULL,
    "filterValue" TEXT NOT NULL,
    "indexable" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FilterIndexRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsoleMetric" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "page" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "position" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SearchConsoleMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCitation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "assistant" TEXT NOT NULL,
    "query" TEXT,
    "url" TEXT NOT NULL,
    "seenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedMeasurement" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lcpMs" INTEGER,
    "cls" DOUBLE PRECISION,
    "inpMs" INTEGER,
    "ttfbMs" INTEGER,
    "pageBytes" INTEGER,
    "passed" BOOLEAN,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeedMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalLinkRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "rule" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InternalLinkRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoIssue" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "issue" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SeoIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogCategory" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "parentId" UUID,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "isPillar" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogAuthor" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "agentKey" TEXT,
    "isAiAuthor" BOOLEAN NOT NULL DEFAULT false,
    "bioEn" TEXT,
    "bioBn" TEXT,
    "avatarAssetId" UUID,
    "reviewerLine" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "categoryId" UUID,
    "authorId" UUID,
    "clusterId" UUID,
    "topicId" UUID,
    "twinPostId" UUID,
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'IDEA',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "wordCount" INTEGER,
    "readingMinutes" INTEGER,
    "similarityScore" DOUBLE PRECISION,
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrls" TEXT[],
    "factSources" JSONB,
    "scheduledAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "contentUpdatedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostReview" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "reviewerAgent" TEXT,
    "reviewerId" UUID,
    "verdict" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogTag" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPostTag" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogPostTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogTopic" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "pillar" TEXT,
    "keywords" TEXT[],
    "source" TEXT NOT NULL,
    "demandScore" INTEGER,
    "status" TEXT NOT NULL,
    "batchMonth" TEXT,
    "approvedById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogBrief" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "topicId" UUID,
    "postId" UUID,
    "wordCount" INTEGER NOT NULL,
    "keywords" TEXT[],
    "language" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "imagePolicy" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCluster" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "pillarPostId" UUID,
    "keywords" TEXT[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseAd" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetRef" TEXT,
    "creativeAssetId" UUID,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HouseAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseAdPlacement" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adId" UUID NOT NULL,
    "slot" TEXT NOT NULL,
    "postId" UUID,
    "blogCategoryId" UUID,
    "afterParagraph" INTEGER,
    "trigger" JSONB,
    "frequencyCap" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HouseAdPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleBn" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyBn" TEXT,
    "answerTemplate" TEXT,
    "ruleRefs" TEXT[],
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogComment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID NOT NULL,
    "customerId" UUID,
    "name" TEXT,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageSourcingRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID,
    "source" TEXT NOT NULL,
    "query" TEXT,
    "licence" TEXT,
    "attribution" TEXT,
    "assetId" UUID,
    "estimateMinor" INTEGER,
    "status" TEXT NOT NULL,
    "approvalRequestId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ImageSourcingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingTemplate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "audienceId" UUID,
    "offer" JSONB,
    "couponId" UUID,
    "budgetMinor" INTEGER,
    "budgetCurrency" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "integrationId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adAccountId" UUID NOT NULL,
    "campaignId" UUID,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "objective" TEXT,
    "dailyBudgetMinor" INTEGER,
    "lifetimeBudgetMinor" INTEGER,
    "currency" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSet" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adCampaignId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targeting" JSONB,
    "dailyBudgetMinor" INTEGER,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adSetId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "creativeId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSpendDaily" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adAccountId" UUID NOT NULL,
    "adCampaignId" UUID,
    "date" DATE NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "spendMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "spendStoreMinor" INTEGER,
    "exchangeRateId" UUID,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "deliveredPurchases" INTEGER NOT NULL DEFAULT 0,
    "erpPushedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdSpendDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "setById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAlertRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "scope" JSONB,
    "thresholdMinor" INTEGER,
    "thresholdValue" DECIMAL(18,4),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGuardrail" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adAccountId" UUID,
    "targetSalesMinor" INTEGER,
    "maxCpaMinor" INTEGER,
    "dailyCeilingMinor" INTEGER,
    "monthlyCeilingMinor" INTEGER,
    "allowAutoDecrease" BOOLEAN NOT NULL DEFAULT false,
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdGuardrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdChangeRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "adCampaignId" UUID,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "requestedByAgent" TEXT,
    "requestedById" UUID,
    "status" TEXT NOT NULL,
    "approvalRequestId" UUID,
    "appliedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" UUID,
    "visitorId" TEXT,
    "valueMinor" INTEGER,
    "payload" JSONB NOT NULL,
    "platformsSent" JSONB,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ServerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audience" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "segmentId" UUID,
    "size" INTEGER,
    "lastBuiltAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Audience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudienceSync" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "audienceId" UUID NOT NULL,
    "adAccountId" UUID NOT NULL,
    "externalAudienceId" TEXT,
    "status" TEXT NOT NULL,
    "memberCount" INTEGER,
    "syncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AudienceSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "minOrderMinor" INTEGER,
    "maxDiscountMinor" INTEGER,
    "usageLimit" INTEGER,
    "perCustomerLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "campaignId" UUID,
    "ruleId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "couponId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID,
    "phone" TEXT,
    "discountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "referrerCustomerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "refereeCustomerId" UUID,
    "orderId" UUID,
    "rewardMinor" INTEGER,
    "status" TEXT NOT NULL,
    "rewardedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryMessage" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "checkoutDraftId" UUID,
    "cartId" UUID,
    "attempt" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "offerCouponId" UUID,
    "notificationLogId" UUID,
    "recoveredOrderId" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecoveryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "audienceId" UUID,
    "templateId" UUID,
    "throttlePerMinute" INTEGER,
    "scheduledAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeChannel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "YoutubeChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeVideo" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "channelId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productIds" UUID[],
    "views" INTEGER NOT NULL DEFAULT 0,
    "attributedOrders" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "YoutubeVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachProspect" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "site" TEXT NOT NULL,
    "contact" TEXT,
    "status" TEXT NOT NULL,
    "linkUrl" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OutreachProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledLayoutSwitch" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "snapshotId" UUID NOT NULL,
    "applyAt" TIMESTAMPTZ(3) NOT NULL,
    "revertAt" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduledLayoutSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "schedule" TEXT,
    "lastRunAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorReport" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "competitorId" UUID NOT NULL,
    "findings" JSONB NOT NULL,
    "diff" JSONB,
    "reportAssetId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoAdRecommendation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "districtId" UUID NOT NULL,
    "categoryId" UUID,
    "recommendation" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoAdRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFeed" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT,
    "itemCount" INTEGER,
    "status" TEXT NOT NULL,
    "testResult" JSONB,
    "lastBuiltAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "email" TEXT,
    "whatsappNumber" TEXT,
    "gender" TEXT,
    "genderInferred" BOOLEAN NOT NULL DEFAULT false,
    "birthday" DATE,
    "firstSource" TEXT,
    "firstCampaignRef" TEXT,
    "gradeId" UUID,
    "verifiedAt" TIMESTAMPTZ(3),
    "codPolicy" TEXT,
    "codPolicySetById" UUID,
    "codPolicyReason" TEXT,
    "smsMarketingConsent" BOOLEAN,
    "whatsappMarketingConsent" BOOLEAN,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "returnedCount" INTEGER NOT NULL DEFAULT 0,
    "refusedCount" INTEGER NOT NULL DEFAULT 0,
    "lifetimeValueMinor" INTEGER NOT NULL DEFAULT 0,
    "lastOrderAt" TIMESTAMPTZ(3),
    "legacyImportId" UUID,
    "erasedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerGrade" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "criteria" JSONB NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNote" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTag" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTagLink" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerTagLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccessLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "staffUserId" UUID,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID,
    "orderId" UUID,
    "phone" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "memberCount" INTEGER,
    "lastComputedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentMember" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "segmentId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SegmentMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTouchpoint" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID,
    "visitorId" TEXT,
    "kind" TEXT NOT NULL,
    "source" TEXT,
    "campaignRef" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTouchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEnrollment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "journeyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "nextRunAt" TIMESTAMPTZ(3),
    "exitedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JourneyEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "earnRule" JSONB NOT NULL,
    "burnRule" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RewardRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "pointsAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "reviewId" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegacyImport" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "fileAssetId" UUID,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "startedById" UUID,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegacyImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerErasureRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "customerId" UUID NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "requestedById" UUID,
    "approvalRequestId" UUID,
    "executedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CustomerErasureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgent" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "role" TEXT NOT NULL,
    "emoji" TEXT,
    "photoAssetRef" TEXT,
    "bio" TEXT,
    "joinedOn" DATE,
    "isChief" BOOLEAN NOT NULL DEFAULT false,
    "reportsToId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "keepOnWhenMasterOff" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "monthlyCapMinor" INTEGER,
    "schedule" JSONB,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentStoreSetting" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "agentId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyCapMinor" INTEGER,
    "schedule" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiAgentStoreSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProvider" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kinds" TEXT[],
    "integrationId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModel" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "modelKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "inputPerMillionMicros" BIGINT,
    "outputPerMillionMicros" BIGINT,
    "perImageMicros" BIGINT,
    "perVideoSecondMicros" BIGINT,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priceCheckedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJobType" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "description" TEXT,
    "agentKey" TEXT,
    "selectedModelId" UUID,
    "recommendedModelId" UUID,
    "recommendationNote" TEXT,
    "estimatePerRunMicros" BIGINT,
    "actualPerRunMicros" BIGINT,
    "typicalRunsPerDay" INTEGER,
    "qualityBar" JSONB,
    "dataClass" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiJobType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelPreset" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiModelPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataClassRoute" (
    "id" UUID NOT NULL,
    "dataClass" TEXT NOT NULL,
    "allowedModelKinds" TEXT[],
    "maskingRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DataClassRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPermission" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLedger" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentId" UUID,
    "jobTypeKey" TEXT,
    "providerKey" TEXT NOT NULL,
    "modelKey" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "images" INTEGER NOT NULL DEFAULT 0,
    "videoSeconds" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicros" BIGINT NOT NULL,
    "costMinor" INTEGER NOT NULL,
    "exchangeRateId" UUID,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCapEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentKey" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCapEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCostPlan" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "description" TEXT NOT NULL,
    "jobTypeKey" TEXT,
    "inputs" JSONB NOT NULL,
    "estimateMicros" BIGINT NOT NULL,
    "alternatives" JSONB,
    "savedAsPlan" BOOLEAN NOT NULL DEFAULT false,
    "actualMicros" BIGINT,
    "createdVia" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiCostPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiApprovalRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentKey" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "channel" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "decidedById" UUID,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDiaryEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "summaryBn" TEXT NOT NULL,
    "details" JSONB,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBugReport" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "reportedBy" TEXT NOT NULL,
    "agentKey" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "investigation" JSONB,
    "proposedFix" TEXT,
    "approvalRequestId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiBugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSkill" (
    "id" UUID NOT NULL,
    "agentId" UUID,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "confidence" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSkillVersion" (
    "id" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changeNote" TEXT,
    "sandboxResult" JSONB,
    "approvedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSkillExport" (
    "id" UUID NOT NULL,
    "skillVersionId" UUID,
    "agentKey" TEXT NOT NULL,
    "gitPath" TEXT NOT NULL,
    "commitSha" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiSkillExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTrainingExample" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "skillKey" TEXT,
    "kind" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT,
    "sourceRef" TEXT,
    "createdById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiTrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSandboxRun" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "agentKey" TEXT,
    "skillKey" TEXT,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSandboxRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiModelQualification" (
    "id" UUID NOT NULL,
    "jobTypeKey" TEXT NOT NULL,
    "modelId" UUID NOT NULL,
    "qualityScore" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "costPer100RunsMicros" BIGINT,
    "testedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiModelQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAgentAssignment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "assignedById" UUID,
    "status" TEXT NOT NULL,
    "dueAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiAgentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiWorkLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentId" UUID NOT NULL,
    "taskRef" TEXT,
    "prRef" TEXT,
    "files" TEXT[],
    "summary" TEXT NOT NULL,
    "outcome" TEXT,
    "tests" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiWorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAppraisal" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "kpis" JSONB NOT NULL,
    "report" TEXT NOT NULL,
    "ratings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCurriculumLevel" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "track" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "earnedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiCurriculumLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMemory" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "agentId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "sourceRef" TEXT,
    "embedding" BYTEA,
    "correctedById" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInvestigation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "question" TEXT NOT NULL,
    "askedVia" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findings" JSONB,
    "evidence" JSONB,
    "responsibleAgent" TEXT,
    "assignmentId" UUID,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramChat" (
    "id" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "staffUserId" UUID,
    "label" TEXT,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "pairingCodeHash" TEXT,
    "pairedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TelegramChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramMessage" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "agentKey" TEXT,
    "text" TEXT NOT NULL,
    "command" TEXT,
    "assignmentId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLearningSource" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastReadAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiLearningSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLearningTip" (
    "id" UUID NOT NULL,
    "sourceId" UUID,
    "agentKey" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verification" JSONB,
    "confidence" TEXT,
    "skillKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiLearningTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiPracticeTask" (
    "id" UUID NOT NULL,
    "agentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "deadline" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL,
    "grade" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiPracticeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "customerId" UUID,
    "isLoggedIn" BOOLEAN NOT NULL,
    "pageType" TEXT,
    "productId" UUID,
    "categoryId" UUID,
    "comboId" UUID,
    "sourceButton" TEXT,
    "props" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Funnel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Funnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDigest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "kind" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "content" JSONB NOT NULL,
    "sentTelegramAt" TIMESTAMPTZ(3),
    "sentEmailAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "service" TEXT NOT NULL,
    "module" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "detail" TEXT,
    "source" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepaidBalance" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "service" TEXT NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "lowThresholdMinor" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrepaidBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrepaidTopUp" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "balanceId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "credits" INTEGER,
    "enteredById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrepaidTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseHead" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "erpExpenseHeadId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExpenseHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailExpense" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "headId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "enteredById" UUID,
    "erpPushId" UUID,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RetailExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthClose" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "totals" JSONB NOT NULL,
    "differences" JSONB,
    "pushedToErpAt" TIMESTAMPTZ(3),
    "closedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MonthClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProfit" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "revenueMinor" INTEGER NOT NULL,
    "cogsMinor" INTEGER NOT NULL,
    "courierMinor" INTEGER NOT NULL,
    "gatewayMinor" INTEGER NOT NULL,
    "packagingMinor" INTEGER NOT NULL,
    "aiSmsMinor" INTEGER NOT NULL,
    "adSpendMinor" INTEGER NOT NULL,
    "profitMinor" INTEGER NOT NULL,
    "computedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderProfit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "refId" UUID,
    "rateBps" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VatRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "reportKey" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "channels" TEXT[],
    "recipients" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffBadge" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "staffUserId" UUID NOT NULL,
    "badgeKey" TEXT NOT NULL,
    "reason" TEXT,
    "awardedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreDomain" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "hostname" TEXT NOT NULL,
    "isPrimaryHost" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "cloudflareZoneRef" TEXT,
    "certificateStatus" TEXT,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStoreListing" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "nameOverride" TEXT,
    "slugOverride" TEXT,
    "descriptionOverride" TEXT,
    "seoTitleOverride" TEXT,
    "priceOverrides" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductStoreListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeTemplateSet" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templates" JSONB NOT NULL,
    "components" JSONB NOT NULL,
    "typographyPack" JSONB NOT NULL,
    "colorSystem" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ThemeTemplateSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreBrandProfile" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "tone" TEXT,
    "voiceGuide" TEXT,
    "bannedPhrases" TEXT[],
    "modelIds" UUID[],
    "sceneStyle" JSONB,
    "photoGrade" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoreBrandProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamenessCheck" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "otherStoreId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamenessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "filters" JSONB,
    "excludesOwnerData" BOOLEAN NOT NULL DEFAULT true,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "rowCount" INTEGER,
    "fileAssetId" UUID,
    "requestedById" UUID,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualArticle" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "parentKey" TEXT,
    "kind" TEXT NOT NULL,
    "route" TEXT,
    "titleEn" TEXT NOT NULL,
    "titleBn" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyBn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ManualArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "BackgroundStatus" NOT NULL,
    "bytes" BIGINT,
    "location" TEXT,
    "checksum" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreTest" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "pointInTime" TIMESTAMPTZ(3),
    "status" "BackgroundStatus" NOT NULL,
    "durationMs" INTEGER,
    "checks" JSONB,
    "notifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestoreTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreRequest" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "pointInTime" TIMESTAMPTZ(3),
    "confirmationTyped" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" UUID,
    "approvedById" UUID,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RestoreRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeployRecord" (
    "id" UUID NOT NULL,
    "gitSha" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeployRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoLiveCheck" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelBn" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidence" TEXT,
    "checkedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GoLiveCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationCrawlCheck" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "redirectedTo" TEXT,
    "ok" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationCrawlCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "paperSize" TEXT,
    "widthMm" INTEGER,
    "heightMm" INTEGER,
    "blocks" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "templateId" UUID,
    "templateVersion" INTEGER,
    "orderId" UUID,
    "refType" TEXT,
    "refId" TEXT,
    "format" TEXT NOT NULL,
    "assetId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "regeneratedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickingList" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderIds" UUID[],
    "summary" JSONB NOT NULL,
    "dateFrom" TIMESTAMPTZ(3),
    "dateTo" TIMESTAMPTZ(3),
    "documentId" UUID,
    "generatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPoint" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isBackendOnly" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChecklistPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAuditSchedule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "groups" TEXT[],
    "journeys" TEXT[],
    "agentCount" INTEGER NOT NULL,
    "devices" TEXT[],
    "telegramReport" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "nextRunAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteAuditSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAuditRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "scheduleId" UUID,
    "trigger" TEXT NOT NULL,
    "status" "BackgroundStatus" NOT NULL,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "reportAssetId" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteAuditRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAuditFinding" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "runId" UUID NOT NULL,
    "checklistCode" TEXT,
    "page" TEXT,
    "device" TEXT,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reproduce" TEXT,
    "suggestedFix" TEXT,
    "fixStatus" TEXT NOT NULL,
    "approvalRequestId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteAuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceHealthSample" (
    "id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "up" BOOLEAN NOT NULL,
    "cpuPercent" DOUBLE PRECISION,
    "memMb" INTEGER,
    "memLimitMb" INTEGER,
    "details" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceHealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlowQuery" (
    "id" UUID NOT NULL,
    "queryHash" TEXT NOT NULL,
    "sampleQuery" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "meanMs" DOUBLE PRECISION NOT NULL,
    "maxMs" DOUBLE PRECISION NOT NULL,
    "totalMs" DOUBLE PRECISION NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SlowQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CacheStatSample" (
    "id" UUID NOT NULL,
    "layer" TEXT NOT NULL,
    "hitPercent" DOUBLE PRECISION NOT NULL,
    "requests" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CacheStatSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrRegisterEntry" (
    "id" UUID NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerAgent" TEXT,
    "demoRef" TEXT,
    "details" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrRegisterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrRegisterUpdate" (
    "id" UUID NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "round" TEXT,
    "note" TEXT NOT NULL,
    "seenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrRegisterUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisterDocument" (
    "id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL,
    "assetRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RegisterDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changeNote" TEXT,
    "prNumber" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChannel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationId" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportContact" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "channelKind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "customerId" UUID,
    "displayName" TEXT,
    "phone" TEXT,
    "mergedIntoId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "channelId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "customerId" UUID,
    "status" TEXT NOT NULL,
    "assignedToId" UUID,
    "handledByAi" BOOLEAN NOT NULL DEFAULT false,
    "refCode" TEXT NOT NULL,
    "priority" TEXT,
    "tags" TEXT[],
    "lastMessageAt" TIMESTAMPTZ(3),
    "firstResponseAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "slaDueAt" TIMESTAMPTZ(3),
    "windowExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "senderType" "ActorType" NOT NULL,
    "senderStaffId" UUID,
    "senderAgentKey" TEXT,
    "body" TEXT,
    "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
    "externalMessageId" TEXT,
    "status" TEXT,
    "linkSafety" JSONB,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "messageId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "assetId" UUID,
    "driveFileId" TEXT,
    "thumbnailAssetId" UUID,
    "status" TEXT NOT NULL,
    "transcriptBn" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID,
    "customerId" UUID,
    "orderId" UUID,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerId" UUID,
    "priority" TEXT,
    "firstResponseDueAt" TIMESTAMPTZ(3),
    "resolutionDueAt" TIMESTAMPTZ(3),
    "firstResponseAt" TIMESTAMPTZ(3),
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCart" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "items" JSONB NOT NULL,
    "fraudGate" TEXT,
    "status" TEXT NOT NULL,
    "orderId" UUID,
    "createdById" UUID,
    "createdByAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportProductShare" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "refCode" TEXT NOT NULL,
    "sentById" UUID,
    "clickedAt" TIMESTAMPTZ(3),
    "orderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportProductShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportFollowUp" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "ruleKey" TEXT,
    "offerCouponId" UUID,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportEscalation" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "conversationId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "notifiedVia" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "embedding" BYTEA,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPushSubscription" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffPushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "integrationId" UUID,
    "requireApproval" BOOLEAN NOT NULL,
    "directPostApproved" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioTemplate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudioTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "accountId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "caption" TEXT,
    "hashtags" TEXT[],
    "mediaAssetIds" UUID[],
    "productIds" UUID[],
    "templateId" UUID,
    "needsTrendingAudio" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3),
    "externalPostId" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "error" TEXT,
    "approvalRequestId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialScheduleRule" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "accountId" UUID,
    "cadence" JSONB NOT NULL,
    "categoryIds" UUID[],
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SocialScheduleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialRenderJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID,
    "templateId" UUID,
    "input" JSONB NOT NULL,
    "status" "BackgroundStatus" NOT NULL DEFAULT 'QUEUED',
    "outputAssetId" UUID,
    "error" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SocialRenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioModel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "ageGroup" TEXT,
    "kind" TEXT NOT NULL,
    "heightCm" INTEGER,
    "sizeWorn" TEXT,
    "categoryIds" UUID[],
    "sharedWithAllStores" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudioModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioModelAsset" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "modelId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "angle" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudioModelAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelConsent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "modelId" UUID NOT NULL,
    "documentAssetId" UUID,
    "scope" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ModelConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioScene" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occasion" TEXT,
    "assetId" UUID,
    "tags" TEXT[],
    "sharedWithAllStores" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StudioScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotRecipe" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID,
    "engine" TEXT NOT NULL,
    "angles" TEXT[],
    "steps" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShotRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoshootJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "colourId" UUID,
    "recipeId" UUID,
    "modelId" UUID,
    "sceneId" UUID,
    "angle" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'DRAFT',
    "provider" TEXT,
    "providerJobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "seed" TEXT,
    "inputAssetIds" UUID[],
    "reuseHash" TEXT,
    "estimateMinor" INTEGER,
    "actualMinor" INTEGER,
    "error" TEXT,
    "requestedById" UUID,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhotoshootJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoshootOutput" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "jobId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "candidateIndex" INTEGER NOT NULL,
    "scores" JSONB,
    "passedThreshold" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" TEXT NOT NULL,
    "rejectReason" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PhotoshootOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageEdit" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "sourceAssetId" UUID NOT NULL,
    "resultAssetId" UUID,
    "operations" JSONB NOT NULL,
    "editedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetailRegion" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "bbox" JSONB NOT NULL,
    "detectedBy" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DetailRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColourVerification" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "assetId" UUID NOT NULL,
    "colourId" UUID,
    "deltaE" DOUBLE PRECISION NOT NULL,
    "withinTolerance" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColourVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioPilotRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "provider" TEXT,
    "generatedImages" INTEGER NOT NULL,
    "approvedImages" INTEGER NOT NULL,
    "costPerApprovedMinor" INTEGER,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioPilotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationNote" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL,
    "conditions" JSONB,
    "noteEn" TEXT NOT NULL,
    "noteBn" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecommendationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotionAction" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" UUID,
    "spec" JSONB NOT NULL,
    "sharedWithAllStores" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MotionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "productId" UUID,
    "sourceAssetId" UUID NOT NULL,
    "actionId" UUID,
    "provider" TEXT,
    "providerJobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "StudioJobStatus" NOT NULL DEFAULT 'DRAFT',
    "durationSec" INTEGER,
    "aspect" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "estimateMinor" INTEGER,
    "actualMinor" INTEGER,
    "outputAssetId" UUID,
    "requestedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VideoJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "clipJobIds" UUID[],
    "musicAssetId" UUID,
    "overlays" JSONB,
    "aspects" TEXT[],
    "status" TEXT NOT NULL,
    "outputAssetIds" UUID[],
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignOverlay" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "campaignId" UUID,
    "templateKey" TEXT NOT NULL,
    "design" JSONB NOT NULL,
    "appliesTo" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CampaignOverlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeBrief" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "campaignId" UUID,
    "answers" JSONB NOT NULL,
    "directions" JSONB,
    "chosenDirection" INTEGER,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreativeBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeExport" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "campaignId" UUID,
    "briefId" UUID,
    "selection" JSONB NOT NULL,
    "sizes" TEXT[],
    "withOverlay" BOOLEAN NOT NULL DEFAULT false,
    "landingUrl" TEXT,
    "outputAssetIds" UUID[],
    "sentToAdAccountId" UUID,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CreativeExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallationSetupRun" (
    "id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InstallationSetupRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateRelease" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "notes" TEXT,
    "availableAt" TIMESTAMPTZ(3) NOT NULL,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UpdateRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_isPrimary_key" ON "Store"("isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "SettingDefinition_key_key" ON "SettingDefinition"("key");

-- CreateIndex
CREATE INDEX "SettingDefinition_group_sortOrder_idx" ON "SettingDefinition"("group", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationSettingValue_key_key" ON "InstallationSettingValue"("key");

-- CreateIndex
CREATE INDEX "StoreSettingValue_key_idx" ON "StoreSettingValue"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSettingValue_storeId_key_key" ON "StoreSettingValue"("storeId", "key");

-- CreateIndex
CREATE INDEX "SettingChange_key_createdAt_idx" ON "SettingChange"("key", "createdAt");

-- CreateIndex
CREATE INDEX "SettingChange_storeId_createdAt_idx" ON "SettingChange"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SettingsMigration_version_key" ON "SettingsMigration"("version");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerDataEntry_kind_target_key" ON "OwnerDataEntry"("kind", "target");

-- CreateIndex
CREATE UNIQUE INDEX "DefaultPackApplication_storeId_packKey_version_key" ON "DefaultPackApplication"("storeId", "packKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "VaultKey_version_key" ON "VaultKey"("version");

-- CreateIndex
CREATE UNIQUE INDEX "InstallationSecret_name_key" ON "InstallationSecret"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSecret_storeId_name_key" ON "StoreSecret"("storeId", "name");

-- CreateIndex
CREATE INDEX "SecretAccessLog_secretName_createdAt_idx" ON "SecretAccessLog"("secretName", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUser_email_key" ON "StaffUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSession_tokenHash_key" ON "StaffSession"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffSession_staffUserId_revokedAt_idx" ON "StaffSession"("staffUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "StaffLoginEvent_email_createdAt_idx" ON "StaffLoginEvent"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "StaffRoleAssignment_staffUserId_roleId_storeId_key" ON "StaffRoleAssignment"("staffUserId", "roleId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIpAllowlistEntry_cidr_key" ON "AdminIpAllowlistEntry"("cidr");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCredential_customerId_key" ON "CustomerCredential"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerSession_storeId_customerId_idx" ON "CustomerSession"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "OtpChallenge_storeId_phone_createdAt_idx" ON "OtpChallenge"("storeId", "phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_storeId_kind_provider_name_key" ON "Integration"("storeId", "kind", "provider", "name");

-- CreateIndex
CREATE INDEX "IntegrationTestRun_integrationId_createdAt_idx" ON "IntegrationTestRun"("integrationId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_scope_key_key" ON "IdempotencyKey"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_key_key" ON "ScheduledJob"("key");

-- CreateIndex
CREATE INDEX "JobRun_jobKey_startedAt_idx" ON "JobRun"("jobKey", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_status_startedAt_idx" ON "JobRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_receivedAt_idx" ON "WebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_source_idempotencyKey_key" ON "WebhookEvent"("source", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_storeId_slug_key" ON "Brand"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentType_storeId_key_key" ON "GarmentType"("storeId", "key");

-- CreateIndex
CREATE INDEX "Category_storeId_parentId_sortOrder_idx" ON "Category"("storeId", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_storeId_slug_key" ON "Category"("storeId", "slug");

-- CreateIndex
CREATE INDEX "idx_style_group_parent" ON "StyleGroup"("storeId", "parentId");

-- CreateIndex
CREATE INDEX "idx_style_group_ancestors" ON "StyleGroup" USING GIN ("ancestorIds");

-- CreateIndex
CREATE INDEX "idx_product_style" ON "Product"("storeId", "styleGroupId");

-- CreateIndex
CREATE INDEX "Product_storeId_status_publishedAt_idx" ON "Product"("storeId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Product_storeId_erpStyleCode_idx" ON "Product"("storeId", "erpStyleCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_storeId_slug_key" ON "Product"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Colour_storeId_key_key" ON "Colour"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Size_storeId_key_key" ON "Size"("storeId", "key");

-- CreateIndex
CREATE INDEX "idx_variant_colour_size" ON "ProductVariant"("productId", "colourId", "sizeId");

-- CreateIndex
CREATE INDEX "ProductVariant_barcode_idx" ON "ProductVariant"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "uq_variant_sku" ON "ProductVariant"("storeId", "sku");

-- CreateIndex
CREATE INDEX "PriceHistory_storeId_variantId_effectiveFrom_idx" ON "PriceHistory"("storeId", "variantId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ProductColour_productId_colourId_key" ON "ProductColour"("productId", "colourId");

-- CreateIndex
CREATE INDEX "MediaAsset_storeId_kind_createdAt_idx" ON "MediaAsset"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_checksumSha256_idx" ON "MediaAsset"("checksumSha256");

-- CreateIndex
CREATE UNIQUE INDEX "MediaRendition_assetId_preset_format_key" ON "MediaRendition"("assetId", "preset", "format");

-- CreateIndex
CREATE INDEX "ProductMedia_productId_colourId_sortOrder_idx" ON "ProductMedia"("productId", "colourId", "sortOrder");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_storeId_categoryId_idx" ON "SizeChartAssignment"("storeId", "categoryId");

-- CreateIndex
CREATE INDEX "SizeChartAssignment_storeId_productId_idx" ON "SizeChartAssignment"("storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_storeId_slug_key" ON "Collection"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProduct_collectionId_productId_key" ON "CollectionProduct"("collectionId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_storeId_slug_key" ON "Tag"("storeId", "slug");

-- CreateIndex
CREATE INDEX "ProductTag_productId_idx" ON "ProductTag"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_tagId_productId_key" ON "ProductTag"("tagId", "productId");

-- CreateIndex
CREATE INDEX "PublishQueueItem_storeId_status_createdAt_idx" ON "PublishQueueItem"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BackInStockRequest_storeId_productId_notifiedAt_idx" ON "BackInStockRequest"("storeId", "productId", "notifiedAt");

-- CreateIndex
CREATE INDEX "ProductRename_storeId_productId_createdAt_idx" ON "ProductRename"("storeId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_category_page" ON "CategoryProduct"("categoryId", "storeId", "inStock", "sortRank" DESC);

-- CreateIndex
CREATE INDEX "idx_category_page_price" ON "CategoryProduct"("categoryId", "storeId", "inStock", "priceMinor");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryProduct_categoryId_productId_key" ON "CategoryProduct"("categoryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_storeId_kind_slug_key" ON "Page"("storeId", "kind", "slug");

-- CreateIndex
CREATE INDEX "PageSection_storeId_layoutScope_categoryId_position_idx" ON "PageSection"("storeId", "layoutScope", "categoryId", "position");

-- CreateIndex
CREATE INDEX "PageSection_pageId_position_idx" ON "PageSection"("pageId", "position");

-- CreateIndex
CREATE INDEX "SideCanvasZone_storeId_enabled_idx" ON "SideCanvasZone"("storeId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRevision_storeId_entityType_entityId_version_key" ON "ContentRevision"("storeId", "entityType", "entityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_storeId_key_key" ON "Menu"("storeId", "key");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_parentId_position_idx" ON "MenuItem"("menuId", "parentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Theme_storeId_key_key" ON "Theme"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LabelEntry_storeId_namespace_key_key" ON "LabelEntry"("storeId", "namespace", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AbTest_storeId_key_key" ON "AbTest"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AbAssignment_testId_visitorId_key" ON "AbAssignment"("testId", "visitorId");

-- CreateIndex
CREATE INDEX "Review_storeId_productId_status_publishedAt_idx" ON "Review"("storeId", "productId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "ProductQuestion_storeId_productId_status_idx" ON "ProductQuestion"("storeId", "productId", "status");

-- CreateIndex
CREATE INDEX "WishlistItem_storeId_customerId_idx" ON "WishlistItem"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "WishlistItem_storeId_visitorId_idx" ON "WishlistItem"("storeId", "visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "SizeAdviceModel_storeId_garmentTypeId_fitKey_version_key" ON "SizeAdviceModel"("storeId", "garmentTypeId", "fitKey", "version");

-- CreateIndex
CREATE INDEX "SizeRecommendation_storeId_productId_createdAt_idx" ON "SizeRecommendation"("storeId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "CachePurgeLog_storeId_createdAt_idx" ON "CachePurgeLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Combo_storeId_status_sortRank_idx" ON "Combo"("storeId", "status", "sortRank");

-- CreateIndex
CREATE UNIQUE INDEX "Combo_storeId_slug_key" ON "Combo"("storeId", "slug");

-- CreateIndex
CREATE INDEX "ComboItem_comboId_position_idx" ON "ComboItem"("comboId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SetTier_ruleId_quantity_key" ON "SetTier"("ruleId", "quantity");

-- CreateIndex
CREATE INDEX "ComboTemplateScore_storeId_templateKey_createdAt_idx" ON "ComboTemplateScore"("storeId", "templateKey", "createdAt");

-- CreateIndex
CREATE INDEX "Cart_storeId_visitorId_status_idx" ON "Cart"("storeId", "visitorId", "status");

-- CreateIndex
CREATE INDEX "Cart_storeId_customerId_status_idx" ON "Cart"("storeId", "customerId", "status");

-- CreateIndex
CREATE INDEX "Cart_storeId_status_lastActivityAt_idx" ON "Cart"("storeId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "CartItem_cartId_idx" ON "CartItem"("cartId");

-- CreateIndex
CREATE INDEX "CustomerAddress_storeId_customerId_idx" ON "CustomerAddress"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "idx_address_line_trgm" ON "CustomerAddress" USING GIN ("addressLine" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CheckoutDraft_storeId_phone_idx" ON "CheckoutDraft"("storeId", "phone");

-- CreateIndex
CREATE INDEX "CheckoutDraft_storeId_convertedOrderId_lastActivityAt_idx" ON "CheckoutDraft"("storeId", "convertedOrderId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "CheckoutFlagEvent_storeId_createdAt_idx" ON "CheckoutFlagEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "idx_order_phone" ON "Order"("storeId", "phone", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_order_customer_history" ON "Order"("storeId", "customerId", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_order_list_date" ON "Order"("storeId", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_order_list_status" ON "Order"("storeId", "status", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_order_list_courier" ON "Order"("storeId", "courierAccountId", "status", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_order_name_trgm" ON "Order" USING GIN ("customerName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_order_address_trgm" ON "Order" USING GIN ("shippingAddressText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Order_piiExpiresAt_idx" ON "Order"("piiExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_number_key" ON "Order"("storeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_idempotencyKey_key" ON "Order"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_storeId_productId_createdAt_idx" ON "OrderItem"("storeId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_storeId_variantId_idx" ON "OrderItem"("storeId", "variantId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CallTask_storeId_status_dueAt_idx" ON "CallTask"("storeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_storeId_key_channel_locale_key" ON "NotificationTemplate"("storeId", "key", "channel", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRule_storeId_eventKey_channel_key" ON "NotificationRule"("storeId", "eventKey", "channel");

-- CreateIndex
CREATE INDEX "NotificationLog_storeId_orderId_idx" ON "NotificationLog"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "NotificationLog_storeId_status_createdAt_idx" ON "NotificationLog"("storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_storeId_dedupeKey_key" ON "NotificationLog"("storeId", "dedupeKey");

-- CreateIndex
CREATE INDEX "GeoArea_parentId_idx" ON "GeoArea"("parentId");

-- CreateIndex
CREATE INDEX "GeoArea_level_nameEn_idx" ON "GeoArea"("level", "nameEn");

-- CreateIndex
CREATE INDEX "GeoArea_aliases_idx" ON "GeoArea" USING GIN ("aliases");

-- CreateIndex
CREATE INDEX "GeoArea_postcodes_idx" ON "GeoArea" USING GIN ("postcodes");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryBand_storeId_key_key" ON "DeliveryBand"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AreaBand_storeId_areaId_key" ON "AreaBand"("storeId", "areaId");

-- CreateIndex
CREATE UNIQUE INDEX "CourierAreaMapping_courierAccountId_areaId_key" ON "CourierAreaMapping"("courierAccountId", "areaId");

-- CreateIndex
CREATE INDEX "IdentityLink_storeId_kind_valueNorm_idx" ON "IdentityLink"("storeId", "kind", "valueNorm");

-- CreateIndex
CREATE INDEX "idx_identity_value_trgm" ON "IdentityLink" USING GIN ("valueNorm" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "RiskSignalConfig_storeId_key_key" ON "RiskSignalConfig"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RiskBand_storeId_key_key" ON "RiskBand"("storeId", "key");

-- CreateIndex
CREATE INDEX "RiskAssessment_storeId_orderId_idx" ON "RiskAssessment"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "RiskAssessment_storeId_phone_createdAt_idx" ON "RiskAssessment"("storeId", "phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FraudRule_storeId_key_key" ON "FraudRule"("storeId", "key");

-- CreateIndex
CREATE INDEX "FraudAlert_storeId_status_createdAt_idx" ON "FraudAlert"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "FraudAlert_orderId_idx" ON "FraudAlert"("orderId");

-- CreateIndex
CREATE INDEX "FraudDecision_storeId_createdAt_idx" ON "FraudDecision"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "BlockEntry_storeId_status_idx" ON "BlockEntry"("storeId", "status");

-- CreateIndex
CREATE INDEX "BlockEntry_storeId_phone_idx" ON "BlockEntry"("storeId", "phone");

-- CreateIndex
CREATE INDEX "CourierFraudCheck_storeId_phone_checkedAt_idx" ON "CourierFraudCheck"("storeId", "phone", "checkedAt");

-- CreateIndex
CREATE INDEX "DuplicateNoticeEvent_storeId_createdAt_idx" ON "DuplicateNoticeEvent"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_storeId_orderId_idx" ON "Payment"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "Payment_provider_providerTrxId_idx" ON "Payment"("provider", "providerTrxId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_storeId_idempotencyKey_key" ON "Payment"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CourierSettlement_courierAccountId_reference_key" ON "CourierSettlement"("courierAccountId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_customerId_key" ON "WalletAccount"("customerId");

-- CreateIndex
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_walletId_idempotencyKey_key" ON "WalletEntry"("walletId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GatewayStatementLine_statementId_matchStatus_idx" ON "GatewayStatementLine"("statementId", "matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "CourierAccount_storeId_providerKey_name_key" ON "CourierAccount"("storeId", "providerKey", "name");

-- CreateIndex
CREATE INDEX "CourierRateCard_courierAccountId_zoneKey_validFrom_idx" ON "CourierRateCard"("courierAccountId", "zoneKey", "validFrom");

-- CreateIndex
CREATE INDEX "Shipment_storeId_status_bookedAt_idx" ON "Shipment"("storeId", "status", "bookedAt");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_storeId_idempotencyKey_key" ON "Shipment"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_courierAccountId_consignmentId_key" ON "Shipment"("courierAccountId", "consignmentId");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "PackingIssue_storeId_resolvedAt_idx" ON "PackingIssue"("storeId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Exchange_storeId_status_idx" ON "Exchange"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Exchange_storeId_number_key" ON "Exchange"("storeId", "number");

-- CreateIndex
CREATE INDEX "ReturnRecord_storeId_customerId_idx" ON "ReturnRecord"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "ReturnRecord_storeId_kind_createdAt_idx" ON "ReturnRecord"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ChargeMismatch_storeId_createdAt_idx" ON "ChargeMismatch"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreErpMapping_storeId_key" ON "StoreErpMapping"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_warehouseId_code_key" ON "InventoryLocation"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "StockLevel_locationId_available_idx" ON "StockLevel"("locationId", "available");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_variantId_locationId_key" ON "StockLevel"("variantId", "locationId");

-- CreateIndex
CREATE INDEX "StockReservation_variantId_status_idx" ON "StockReservation"("variantId", "status");

-- CreateIndex
CREATE INDEX "StockReservation_status_expiresAt_idx" ON "StockReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_variantId_createdAt_idx" ON "StockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "LowStockAlert_variantId_resolvedAt_idx" ON "LowStockAlert"("variantId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpSyncState_storeId_resource_key" ON "ErpSyncState"("storeId", "resource");

-- CreateIndex
CREATE INDEX "ErpSyncRun_storeId_kind_startedAt_idx" ON "ErpSyncRun"("storeId", "kind", "startedAt");

-- CreateIndex
CREATE INDEX "ErpPush_status_nextAttemptAt_idx" ON "ErpPush"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpPush_storeId_idempotencyKey_key" ON "ErpPush"("storeId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SmartRule_storeId_kind_status_priority_idx" ON "SmartRule"("storeId", "kind", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "SmartRule_storeId_key_key" ON "SmartRule"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SmartRuleVersion_ruleId_version_key" ON "SmartRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SeoMeta_storeId_entityType_entityId_locale_key" ON "SeoMeta"("storeId", "entityType", "entityId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "SeoTemplate_storeId_pageType_locale_key" ON "SeoTemplate"("storeId", "pageType", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_storeId_fromPath_key" ON "Redirect"("storeId", "fromPath");

-- CreateIndex
CREATE UNIQUE INDEX "NotFoundHit_storeId_path_key" ON "NotFoundHit"("storeId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "FilterIndexRule_categoryId_filterKey_filterValue_key" ON "FilterIndexRule"("categoryId", "filterKey", "filterValue");

-- CreateIndex
CREATE UNIQUE INDEX "SearchConsoleMetric_storeId_source_date_page_query_key" ON "SearchConsoleMetric"("storeId", "source", "date", "page", "query");

-- CreateIndex
CREATE INDEX "SpeedMeasurement_storeId_measuredAt_idx" ON "SpeedMeasurement"("storeId", "measuredAt");

-- CreateIndex
CREATE INDEX "SeoIssue_storeId_resolvedAt_idx" ON "SeoIssue"("storeId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogCategory_storeId_slug_key" ON "BlogCategory"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogAuthor_storeId_slug_key" ON "BlogAuthor"("storeId", "slug");

-- CreateIndex
CREATE INDEX "BlogPost_storeId_status_publishedAt_idx" ON "BlogPost"("storeId", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_storeId_locale_slug_key" ON "BlogPost"("storeId", "locale", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogTag_storeId_slug_key" ON "BlogTag"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPostTag_postId_tagId_key" ON "BlogPostTag"("postId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_storeId_slug_key" ON "HelpArticle"("storeId", "slug");

-- CreateIndex
CREATE INDEX "CalendarEntry_storeId_date_idx" ON "CalendarEntry"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LandingTemplate_storeId_key_key" ON "LandingTemplate"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_storeId_platform_externalId_key" ON "AdAccount"("storeId", "platform", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_adAccountId_externalId_key" ON "AdCampaign"("adAccountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSet_adCampaignId_externalId_key" ON "AdSet"("adCampaignId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_adSetId_externalId_key" ON "Ad"("adSetId", "externalId");

-- CreateIndex
CREATE INDEX "AdSpendDaily_storeId_date_idx" ON "AdSpendDaily"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpendDaily_adAccountId_adCampaignId_date_key" ON "AdSpendDaily"("adAccountId", "adCampaignId", "date");

-- CreateIndex
CREATE INDEX "ExchangeRate_storeId_baseCurrency_quoteCurrency_effectiveFr_idx" ON "ExchangeRate"("storeId", "baseCurrency", "quoteCurrency", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ServerEvent_storeId_status_createdAt_idx" ON "ServerEvent"("storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServerEvent_storeId_eventId_key" ON "ServerEvent"("storeId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AudienceSync_audienceId_adAccountId_key" ON "AudienceSync"("audienceId", "adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_phone_idx" ON "CouponRedemption"("couponId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_orderId_key" ON "CouponRedemption"("couponId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_storeId_code_key" ON "Referral"("storeId", "code");

-- CreateIndex
CREATE INDEX "RecoveryMessage_storeId_kind_createdAt_idx" ON "RecoveryMessage"("storeId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeChannel_storeId_externalId_key" ON "YoutubeChannel"("storeId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeVideo_channelId_externalId_key" ON "YoutubeVideo"("channelId", "externalId");

-- CreateIndex
CREATE INDEX "GeoAdRecommendation_storeId_createdAt_idx" ON "GeoAdRecommendation"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_storeId_lastOrderAt_idx" ON "Customer"("storeId", "lastOrderAt");

-- CreateIndex
CREATE INDEX "idx_customer_name_trgm" ON "Customer" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_storeId_phone_key" ON "Customer"("storeId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGrade_storeId_key_key" ON "CustomerGrade"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTag_storeId_name_key" ON "CustomerTag"("storeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTagLink_customerId_tagId_key" ON "CustomerTagLink"("customerId", "tagId");

-- CreateIndex
CREATE INDEX "CustomerAccessLog_customerId_createdAt_idx" ON "CustomerAccessLog"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_storeId_customerId_channel_createdAt_idx" ON "ConsentRecord"("storeId", "customerId", "channel", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentMember_segmentId_customerId_key" ON "SegmentMember"("segmentId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerTouchpoint_storeId_customerId_occurredAt_idx" ON "CustomerTouchpoint"("storeId", "customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "JourneyEnrollment_status_nextRunAt_idx" ON "JourneyEnrollment"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "RewardEntry_customerId_createdAt_idx" ON "RewardEntry"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewRequest_orderId_key" ON "ReviewRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgent_key_key" ON "AiAgent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgent_code_key" ON "AiAgent"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AiAgentStoreSetting_storeId_agentId_key" ON "AiAgentStoreSetting"("storeId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProvider_key_key" ON "AiProvider"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_providerId_modelKey_key" ON "AiModel"("providerId", "modelKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiJobType_key_key" ON "AiJobType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelPreset_key_key" ON "AiModelPreset"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DataClassRoute_dataClass_key" ON "DataClassRoute"("dataClass");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPermission_agentId_resource_key" ON "AgentPermission"("agentId", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageLedger_idempotencyKey_key" ON "AiUsageLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AiUsageLedger_storeId_createdAt_idx" ON "AiUsageLedger"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLedger_agentId_createdAt_idx" ON "AiUsageLedger"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageLedger_jobTypeKey_createdAt_idx" ON "AiUsageLedger"("jobTypeKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiCapEvent_storeId_agentKey_month_level_key" ON "AiCapEvent"("storeId", "agentKey", "month", "level");

-- CreateIndex
CREATE INDEX "AiApprovalRequest_status_createdAt_idx" ON "AiApprovalRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiApprovalRequest_storeId_status_idx" ON "AiApprovalRequest"("storeId", "status");

-- CreateIndex
CREATE INDEX "AiDiaryEntry_agentId_date_idx" ON "AiDiaryEntry"("agentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AiSkill_key_key" ON "AiSkill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AiSkillVersion_skillId_version_key" ON "AiSkillVersion"("skillId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelQualification_jobTypeKey_modelId_key" ON "AiModelQualification"("jobTypeKey", "modelId");

-- CreateIndex
CREATE INDEX "AiWorkLog_agentId_createdAt_idx" ON "AiWorkLog"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAppraisal_agentId_period_periodStart_key" ON "AiAppraisal"("agentId", "period", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AiCurriculumLevel_agentId_track_level_key" ON "AiCurriculumLevel"("agentId", "track", "level");

-- CreateIndex
CREATE INDEX "AiMemory_agentId_kind_idx" ON "AiMemory"("agentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChat_chatId_key" ON "TelegramChat"("chatId");

-- CreateIndex
CREATE INDEX "TelegramMessage_chatId_createdAt_idx" ON "TelegramMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_storeId_name_occurredAt_idx" ON "AnalyticsEvent"("storeId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_storeId_visitorId_occurredAt_idx" ON "AnalyticsEvent"("storeId", "visitorId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReportDigest_storeId_kind_periodStart_idx" ON "ReportDigest"("storeId", "kind", "periodStart");

-- CreateIndex
CREATE INDEX "CostEntry_storeId_service_occurredAt_idx" ON "CostEntry"("storeId", "service", "occurredAt");

-- CreateIndex
CREATE INDEX "CostEntry_storeId_refType_refId_idx" ON "CostEntry"("storeId", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "PrepaidBalance_storeId_service_key" ON "PrepaidBalance"("storeId", "service");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseHead_storeId_key_key" ON "ExpenseHead"("storeId", "key");

-- CreateIndex
CREATE INDEX "RetailExpense_storeId_date_idx" ON "RetailExpense"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MonthClose_storeId_month_key" ON "MonthClose"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "OrderProfit_orderId_key" ON "OrderProfit"("orderId");

-- CreateIndex
CREATE INDEX "OrderProfit_storeId_computedAt_idx" ON "OrderProfit"("storeId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportSchedule_storeId_reportKey_key" ON "ReportSchedule"("storeId", "reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "StoreDomain_hostname_key" ON "StoreDomain"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "ProductStoreListing_storeId_productId_key" ON "ProductStoreListing"("storeId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ThemeTemplateSet_storeId_key_key" ON "ThemeTemplateSet"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "StoreBrandProfile_storeId_key" ON "StoreBrandProfile"("storeId");

-- CreateIndex
CREATE INDEX "SamenessCheck_storeId_createdAt_idx" ON "SamenessCheck"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_kind_createdAt_idx" ON "SecurityEvent"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ManualArticle_key_key" ON "ManualArticle"("key");

-- CreateIndex
CREATE INDEX "BackupRun_target_startedAt_idx" ON "BackupRun"("target", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoLiveCheck_key_key" ON "GoLiveCheck"("key");

-- CreateIndex
CREATE INDEX "GeneratedDocument_storeId_orderId_kind_idx" ON "GeneratedDocument"("storeId", "orderId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPoint_code_key" ON "ChecklistPoint"("code");

-- CreateIndex
CREATE INDEX "SiteAuditRun_storeId_startedAt_idx" ON "SiteAuditRun"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "ServiceHealthSample_service_createdAt_idx" ON "ServiceHealthSample"("service", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlowQuery_queryHash_key" ON "SlowQuery"("queryHash");

-- CreateIndex
CREATE INDEX "CacheStatSample_layer_createdAt_idx" ON "CacheStatSample"("layer", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrRegisterEntry_prNumber_key" ON "PrRegisterEntry"("prNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RegisterDocument_path_version_key" ON "RegisterDocument"("path", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SupportChannel_storeId_kind_externalId_key" ON "SupportChannel"("storeId", "kind", "externalId");

-- CreateIndex
CREATE INDEX "SupportContact_storeId_phone_idx" ON "SupportContact"("storeId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "SupportContact_storeId_channelKind_externalId_key" ON "SupportContact"("storeId", "channelKind", "externalId");

-- CreateIndex
CREATE INDEX "Conversation_storeId_status_lastMessageAt_idx" ON "Conversation"("storeId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_storeId_assignedToId_status_idx" ON "Conversation"("storeId", "assignedToId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_storeId_refCode_key" ON "Conversation"("storeId", "refCode");

-- CreateIndex
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "Ticket_storeId_status_idx" ON "Ticket"("storeId", "status");

-- CreateIndex
CREATE INDEX "SupportProductShare_storeId_refCode_idx" ON "SupportProductShare"("storeId", "refCode");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_storeId_sourceType_sourceId_idx" ON "KnowledgeChunk"("storeId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPushSubscription_endpoint_key" ON "StaffPushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_storeId_platform_externalId_key" ON "SocialAccount"("storeId", "platform", "externalId");

-- CreateIndex
CREATE INDEX "SocialPost_storeId_status_scheduledAt_idx" ON "SocialPost"("storeId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShotRecipe_storeId_key_version_key" ON "ShotRecipe"("storeId", "key", "version");

-- CreateIndex
CREATE INDEX "PhotoshootJob_storeId_status_idx" ON "PhotoshootJob"("storeId", "status");

-- CreateIndex
CREATE INDEX "PhotoshootJob_productId_idx" ON "PhotoshootJob"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoshootJob_storeId_idempotencyKey_key" ON "PhotoshootJob"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationNote_key_key" ON "RecommendationNote"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MotionAction_storeId_key_key" ON "MotionAction"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "VideoJob_storeId_idempotencyKey_key" ON "VideoJob"("storeId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "UpdateRelease_version_key" ON "UpdateRelease"("version");

-- AddForeignKey
ALTER TABLE "InstallationSettingValue" ADD CONSTRAINT "InstallationSettingValue_key_fkey" FOREIGN KEY ("key") REFERENCES "SettingDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettingValue" ADD CONSTRAINT "StoreSettingValue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSettingValue" ADD CONSTRAINT "StoreSettingValue_key_fkey" FOREIGN KEY ("key") REFERENCES "SettingDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettingChange" ADD CONSTRAINT "SettingChange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefaultPackApplication" ADD CONSTRAINT "DefaultPackApplication_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallationSecret" ADD CONSTRAINT "InstallationSecret_keyVersion_fkey" FOREIGN KEY ("keyVersion") REFERENCES "VaultKey"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSecret" ADD CONSTRAINT "StoreSecret_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSecret" ADD CONSTRAINT "StoreSecret_keyVersion_fkey" FOREIGN KEY ("keyVersion") REFERENCES "VaultKey"("version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretAccessLog" ADD CONSTRAINT "SecretAccessLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSession" ADD CONSTRAINT "StaffSession_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleAssignment" ADD CONSTRAINT "StaffRoleAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredential" ADD CONSTRAINT "CustomerCredential_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredential" ADD CONSTRAINT "CustomerCredential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTestRun" ADD CONSTRAINT "IntegrationTestRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTestRun" ADD CONSTRAINT "IntegrationTestRun_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_jobKey_fkey" FOREIGN KEY ("jobKey") REFERENCES "ScheduledJob"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GarmentType" ADD CONSTRAINT "GarmentType_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES "GarmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleGroup" ADD CONSTRAINT "StyleGroup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleGroup" ADD CONSTRAINT "StyleGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StyleGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_styleGroupId_fkey" FOREIGN KEY ("styleGroupId") REFERENCES "StyleGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colour" ADD CONSTRAINT "Colour_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Size" ADD CONSTRAINT "Size_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "Size"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColour" ADD CONSTRAINT "ProductColour_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColour" ADD CONSTRAINT "ProductColour_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColour" ADD CONSTRAINT "ProductColour_colourId_fkey" FOREIGN KEY ("colourId") REFERENCES "Colour"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaRendition" ADD CONSTRAINT "MediaRendition_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaRendition" ADD CONSTRAINT "MediaRendition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChart" ADD CONSTRAINT "SizeChart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChart" ADD CONSTRAINT "SizeChart_garmentTypeId_fkey" FOREIGN KEY ("garmentTypeId") REFERENCES "GarmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeChartAssignment" ADD CONSTRAINT "SizeChartAssignment_sizeChartId_fkey" FOREIGN KEY ("sizeChartId") REFERENCES "SizeChart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fabric" ADD CONSTRAINT "Fabric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTag" ADD CONSTRAINT "ProductTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportJob" ADD CONSTRAINT "CatalogImportJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishQueueItem" ADD CONSTRAINT "PublishQueueItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackInStockRequest" ADD CONSTRAINT "BackInStockRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRename" ADD CONSTRAINT "ProductRename_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProduct" ADD CONSTRAINT "CategoryProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProduct" ADD CONSTRAINT "CategoryProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryProduct" ADD CONSTRAINT "CategoryProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSection" ADD CONSTRAINT "PageSection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageSection" ADD CONSTRAINT "PageSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SideCanvasZone" ADD CONSTRAINT "SideCanvasZone_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutSnapshot" ADD CONSTRAINT "LayoutSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutRestore" ADD CONSTRAINT "LayoutRestore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayoutRestore" ADD CONSTRAINT "LayoutRestore_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "LayoutSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Menu" ADD CONSTRAINT "Menu_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Theme" ADD CONSTRAINT "Theme_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelEntry" ADD CONSTRAINT "LabelEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbTest" ADD CONSTRAINT "AbTest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbAssignment" ADD CONSTRAINT "AbAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbAssignment" ADD CONSTRAINT "AbAssignment_testId_fkey" FOREIGN KEY ("testId") REFERENCES "AbTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewMedia" ADD CONSTRAINT "ReviewMedia_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewMedia" ADD CONSTRAINT "ReviewMedia_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeAdviceModel" ADD CONSTRAINT "SizeAdviceModel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeRecommendation" ADD CONSTRAINT "SizeRecommendation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchSynonym" ADD CONSTRAINT "SearchSynonym_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CachePurgeLog" ADD CONSTRAINT "CachePurgeLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Combo" ADD CONSTRAINT "Combo_autoRuleId_fkey" FOREIGN KEY ("autoRuleId") REFERENCES "ComboAutoRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboAutoRule" ADD CONSTRAINT "ComboAutoRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetTierRule" ADD CONSTRAINT "SetTierRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetTier" ADD CONSTRAINT "SetTier_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetTier" ADD CONSTRAINT "SetTier_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SetTierRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularPair" ADD CONSTRAINT "PopularPair_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularPair" ADD CONSTRAINT "PopularPair_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboTemplateScore" ADD CONSTRAINT "ComboTemplateScore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GeoArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutParameterLayer" ADD CONSTRAINT "CheckoutParameterLayer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutFlagEvent" ADD CONSTRAINT "CheckoutFlagEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutFlagEvent" ADD CONSTRAINT "CheckoutFlagEvent_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "CheckoutParameterLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutFlagEvent" ADD CONSTRAINT "CheckoutFlagEvent_checkoutDraftId_fkey" FOREIGN KEY ("checkoutDraftId") REFERENCES "CheckoutDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GeoArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryBandId_fkey" FOREIGN KEY ("deliveryBandId") REFERENCES "DeliveryBand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "OrderGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNote" ADD CONSTRAINT "OrderNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderGroup" ADD CONSTRAINT "OrderGroup_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTask" ADD CONSTRAINT "CallTask_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationTemplate" ADD CONSTRAINT "NotificationTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoArea" ADD CONSTRAINT "GeoArea_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GeoArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryBand" ADD CONSTRAINT "DeliveryBand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaBand" ADD CONSTRAINT "AreaBand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaBand" ADD CONSTRAINT "AreaBand_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GeoArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaBand" ADD CONSTRAINT "AreaBand_bandId_fkey" FOREIGN KEY ("bandId") REFERENCES "DeliveryBand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAreaMapping" ADD CONSTRAINT "CourierAreaMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAreaMapping" ADD CONSTRAINT "CourierAreaMapping_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAreaMapping" ADD CONSTRAINT "CourierAreaMapping_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "GeoArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityCluster" ADD CONSTRAINT "IdentityCluster_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLink" ADD CONSTRAINT "IdentityLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityLink" ADD CONSTRAINT "IdentityLink_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "IdentityCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSignalConfig" ADD CONSTRAINT "RiskSignalConfig_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskBand" ADD CONSTRAINT "RiskBand_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudAlert" ADD CONSTRAINT "FraudAlert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FraudRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudDecision" ADD CONSTRAINT "FraudDecision_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockEntry" ADD CONSTRAINT "BlockEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierFraudCheck" ADD CONSTRAINT "CourierFraudCheck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateNoticeEvent" ADD CONSTRAINT "DuplicateNoticeEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementLine" ADD CONSTRAINT "CourierSettlementLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlementLine" ADD CONSTRAINT "CourierSettlementLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "CourierSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayStatement" ADD CONSTRAINT "GatewayStatement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayStatementLine" ADD CONSTRAINT "GatewayStatementLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayStatementLine" ADD CONSTRAINT "GatewayStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "GatewayStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierAccount" ADD CONSTRAINT "CourierAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierRateCard" ADD CONSTRAINT "CourierRateCard_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierRateCard" ADD CONSTRAINT "CourierRateCard_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverBatch" ADD CONSTRAINT "HandoverBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverBatch" ADD CONSTRAINT "HandoverBatch_courierAccountId_fkey" FOREIGN KEY ("courierAccountId") REFERENCES "CourierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingIssue" ADD CONSTRAINT "PackingIssue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exchange" ADD CONSTRAINT "Exchange_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeItem" ADD CONSTRAINT "ExchangeItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeItem" ADD CONSTRAINT "ExchangeItem_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "Exchange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRecord" ADD CONSTRAINT "ReturnRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnItem" ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ReturnRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeMismatch" ADD CONSTRAINT "ChargeMismatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayPeriod" ADD CONSTRAINT "HolidayPeriod_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreErpMapping" ADD CONSTRAINT "StoreErpMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAuditLine" ADD CONSTRAINT "StockAuditLine_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "StockAudit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSyncState" ADD CONSTRAINT "ErpSyncState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpSyncRun" ADD CONSTRAINT "ErpSyncRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPush" ADD CONSTRAINT "ErpPush_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRule" ADD CONSTRAINT "SmartRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRuleVersion" ADD CONSTRAINT "SmartRuleVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRuleVersion" ADD CONSTRAINT "SmartRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SmartRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRuleConflict" ADD CONSTRAINT "SmartRuleConflict_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRuleSimulation" ADD CONSTRAINT "SmartRuleSimulation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoMeta" ADD CONSTRAINT "SeoMeta_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoTemplate" ADD CONSTRAINT "SeoTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redirect" ADD CONSTRAINT "Redirect_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotFoundHit" ADD CONSTRAINT "NotFoundHit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitemapBuild" ADD CONSTRAINT "SitemapBuild_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilterIndexRule" ADD CONSTRAINT "FilterIndexRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleMetric" ADD CONSTRAINT "SearchConsoleMetric_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCitation" ADD CONSTRAINT "AiCitation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedMeasurement" ADD CONSTRAINT "SpeedMeasurement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalLinkRule" ADD CONSTRAINT "InternalLinkRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoIssue" ADD CONSTRAINT "SeoIssue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogCategory" ADD CONSTRAINT "BlogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogAuthor" ADD CONSTRAINT "BlogAuthor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "BlogAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostReview" ADD CONSTRAINT "BlogPostReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostReview" ADD CONSTRAINT "BlogPostReview_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogTag" ADD CONSTRAINT "BlogTag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPostTag" ADD CONSTRAINT "BlogPostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "BlogTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogTopic" ADD CONSTRAINT "BlogTopic_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogBrief" ADD CONSTRAINT "BlogBrief_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCluster" ADD CONSTRAINT "ContentCluster_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAd" ADD CONSTRAINT "HouseAd_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAdPlacement" ADD CONSTRAINT "HouseAdPlacement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseAdPlacement" ADD CONSTRAINT "HouseAdPlacement_adId_fkey" FOREIGN KEY ("adId") REFERENCES "HouseAd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpArticle" ADD CONSTRAINT "HelpArticle_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogComment" ADD CONSTRAINT "BlogComment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageSourcingRequest" ADD CONSTRAINT "ImageSourcingRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEntry" ADD CONSTRAINT "CalendarEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingTemplate" ADD CONSTRAINT "LandingTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSet" ADD CONSTRAINT "AdSet_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "AdSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpendDaily" ADD CONSTRAINT "AdSpendDaily_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpendDaily" ADD CONSTRAINT "AdSpendDaily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAlertRule" ADD CONSTRAINT "AdAlertRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGuardrail" ADD CONSTRAINT "AdGuardrail_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdChangeRequest" ADD CONSTRAINT "AdChangeRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerEvent" ADD CONSTRAINT "ServerEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audience" ADD CONSTRAINT "Audience_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSync" ADD CONSTRAINT "AudienceSync_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudienceSync" ADD CONSTRAINT "AudienceSync_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "Audience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryMessage" ADD CONSTRAINT "RecoveryMessage_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeChannel" ADD CONSTRAINT "YoutubeChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeVideo" ADD CONSTRAINT "YoutubeVideo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeVideo" ADD CONSTRAINT "YoutubeVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "YoutubeChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachProspect" ADD CONSTRAINT "OutreachProspect_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledLayoutSwitch" ADD CONSTRAINT "ScheduledLayoutSwitch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorReport" ADD CONSTRAINT "CompetitorReport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorReport" ADD CONSTRAINT "CompetitorReport_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoAdRecommendation" ADD CONSTRAINT "GeoAdRecommendation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFeed" ADD CONSTRAINT "ProductFeed_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "CustomerGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerGrade" ADD CONSTRAINT "CustomerGrade_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTag" ADD CONSTRAINT "CustomerTag_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagLink" ADD CONSTRAINT "CustomerTagLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagLink" ADD CONSTRAINT "CustomerTagLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTagLink" ADD CONSTRAINT "CustomerTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CustomerTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccessLog" ADD CONSTRAINT "CustomerAccessLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentMember" ADD CONSTRAINT "SegmentMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentMember" ADD CONSTRAINT "SegmentMember_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTouchpoint" ADD CONSTRAINT "CustomerTouchpoint_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEnrollment" ADD CONSTRAINT "JourneyEnrollment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEnrollment" ADD CONSTRAINT "JourneyEnrollment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRule" ADD CONSTRAINT "RewardRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEntry" ADD CONSTRAINT "RewardEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewRequest" ADD CONSTRAINT "ReviewRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyImport" ADD CONSTRAINT "LegacyImport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerErasureRequest" ADD CONSTRAINT "CustomerErasureRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgent" ADD CONSTRAINT "AiAgent_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentStoreSetting" ADD CONSTRAINT "AiAgentStoreSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentStoreSetting" ADD CONSTRAINT "AiAgentStoreSetting_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModel" ADD CONSTRAINT "AiModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AiProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPermission" ADD CONSTRAINT "AgentPermission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLedger" ADD CONSTRAINT "AiUsageLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLedger" ADD CONSTRAINT "AiUsageLedger_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCapEvent" ADD CONSTRAINT "AiCapEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCostPlan" ADD CONSTRAINT "AiCostPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiApprovalRequest" ADD CONSTRAINT "AiApprovalRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDiaryEntry" ADD CONSTRAINT "AiDiaryEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDiaryEntry" ADD CONSTRAINT "AiDiaryEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBugReport" ADD CONSTRAINT "AiBugReport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkill" ADD CONSTRAINT "AiSkill_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkillVersion" ADD CONSTRAINT "AiSkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "AiSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSkillExport" ADD CONSTRAINT "AiSkillExport_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "AiSkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentAssignment" ADD CONSTRAINT "AiAgentAssignment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAgentAssignment" ADD CONSTRAINT "AiAgentAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiWorkLog" ADD CONSTRAINT "AiWorkLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiWorkLog" ADD CONSTRAINT "AiWorkLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAppraisal" ADD CONSTRAINT "AiAppraisal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCurriculumLevel" ADD CONSTRAINT "AiCurriculumLevel_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMemory" ADD CONSTRAINT "AiMemory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AiAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInvestigation" ADD CONSTRAINT "AiInvestigation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramChat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiLearningTip" ADD CONSTRAINT "AiLearningTip_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "AiLearningSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funnel" ADD CONSTRAINT "Funnel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDigest" ADD CONSTRAINT "ReportDigest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepaidBalance" ADD CONSTRAINT "PrepaidBalance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepaidTopUp" ADD CONSTRAINT "PrepaidTopUp_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepaidTopUp" ADD CONSTRAINT "PrepaidTopUp_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "PrepaidBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseHead" ADD CONSTRAINT "ExpenseHead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailExpense" ADD CONSTRAINT "RetailExpense_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailExpense" ADD CONSTRAINT "RetailExpense_headId_fkey" FOREIGN KEY ("headId") REFERENCES "ExpenseHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthClose" ADD CONSTRAINT "MonthClose_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProfit" ADD CONSTRAINT "OrderProfit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatRule" ADD CONSTRAINT "VatRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSchedule" ADD CONSTRAINT "ReportSchedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBadge" ADD CONSTRAINT "StaffBadge_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreDomain" ADD CONSTRAINT "StoreDomain_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStoreListing" ADD CONSTRAINT "ProductStoreListing_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeTemplateSet" ADD CONSTRAINT "ThemeTemplateSet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreBrandProfile" ADD CONSTRAINT "StoreBrandProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamenessCheck" ADD CONSTRAINT "SamenessCheck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamenessCheck" ADD CONSTRAINT "SamenessCheck_otherStoreId_fkey" FOREIGN KEY ("otherStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationCrawlCheck" ADD CONSTRAINT "MigrationCrawlCheck_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDocument" ADD CONSTRAINT "GeneratedDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickingList" ADD CONSTRAINT "PickingList_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAuditSchedule" ADD CONSTRAINT "SiteAuditSchedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAuditRun" ADD CONSTRAINT "SiteAuditRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAuditFinding" ADD CONSTRAINT "SiteAuditFinding_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAuditFinding" ADD CONSTRAINT "SiteAuditFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SiteAuditRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrRegisterUpdate" ADD CONSTRAINT "PrRegisterUpdate_prNumber_fkey" FOREIGN KEY ("prNumber") REFERENCES "PrRegisterEntry"("prNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChannel" ADD CONSTRAINT "SupportChannel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportContact" ADD CONSTRAINT "SupportContact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SupportChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SupportContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCart" ADD CONSTRAINT "SupportCart_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportProductShare" ADD CONSTRAINT "SupportProductShare_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportFollowUp" ADD CONSTRAINT "SupportFollowUp_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportEscalation" ADD CONSTRAINT "SupportEscalation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPushSubscription" ADD CONSTRAINT "StaffPushSubscription_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioTemplate" ADD CONSTRAINT "StudioTemplate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialScheduleRule" ADD CONSTRAINT "SocialScheduleRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialRenderJob" ADD CONSTRAINT "SocialRenderJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioModel" ADD CONSTRAINT "StudioModel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioModelAsset" ADD CONSTRAINT "StudioModelAsset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioModelAsset" ADD CONSTRAINT "StudioModelAsset_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StudioModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelConsent" ADD CONSTRAINT "ModelConsent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelConsent" ADD CONSTRAINT "ModelConsent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StudioModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioScene" ADD CONSTRAINT "StudioScene_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotRecipe" ADD CONSTRAINT "ShotRecipe_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoshootJob" ADD CONSTRAINT "PhotoshootJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoshootOutput" ADD CONSTRAINT "PhotoshootOutput_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoshootOutput" ADD CONSTRAINT "PhotoshootOutput_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PhotoshootJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageEdit" ADD CONSTRAINT "ImageEdit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetailRegion" ADD CONSTRAINT "DetailRegion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColourVerification" ADD CONSTRAINT "ColourVerification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioPilotRun" ADD CONSTRAINT "StudioPilotRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionAction" ADD CONSTRAINT "MotionAction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoJob" ADD CONSTRAINT "VideoJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignOverlay" ADD CONSTRAINT "CampaignOverlay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeBrief" ADD CONSTRAINT "CreativeBrief_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeExport" ADD CONSTRAINT "CreativeExport_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================================================
-- HAND-WRITTEN BELOW THIS LINE — PR 603 report materialized views (not generated by Prisma; Prisma ignores views).
-- Everything above this block is exactly `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
-- --script`; test/migration.test.ts checks that.
--
-- Reports (profit, ads, dashboard charts, district sales) read these views, never the live order tables, so a report
-- never slows a customer (Blueprint A2.9.10).
--
-- REFRESH SCHEDULE: the background job `reports.refresh-views` (ScheduledJob row; BullMQ background-jobs queue, the
-- low-priority report pool of PR 5/603) calls `SELECT extas_refresh_report_views();`. The interval is the setting
-- `reports.viewRefreshMinutes` (default in the general default pack, PR 508) — never a number in code. Each view has a
-- unique index so it refreshes CONCURRENTLY: readers are never blocked while it rebuilds. The admin can also run it
-- on demand from the reports screen. Day and month boundaries use each store's own `Store.timezone`.
-- =====================================================================================================================

-- Daily sales per store: the dashboard charts and the daily report.
CREATE MATERIALIZED VIEW "mv_sales_daily" AS
SELECT
  o."storeId"                                                                      AS "storeId",
  (o."placedAt" AT TIME ZONE s."timezone")::date                                   AS "day",
  count(*)                                                                         AS "orders",
  count(*) FILTER (WHERE o."status" = 'DELIVERED')                                 AS "deliveredOrders",
  count(*) FILTER (WHERE o."status" = 'CANCELLED')                                 AS "cancelledOrders",
  count(*) FILTER (WHERE o."status" = 'RETURNED')                                  AS "returnedOrders",
  COALESCE(sum(o."totalMinor"), 0)::bigint                                         AS "revenueMinor",
  COALESCE(sum(o."totalMinor") FILTER (WHERE o."status" = 'DELIVERED'), 0)::bigint AS "deliveredRevenueMinor",
  COALESCE(sum(o."discountMinor"), 0)::bigint                                      AS "discountMinor",
  COALESCE(sum(o."deliveryChargeMinor"), 0)::bigint                                AS "deliveryChargeMinor"
FROM "Order" o
JOIN "Store" s ON s."id" = o."storeId"
WHERE o."archivedAt" IS NULL AND o."status" <> 'DRAFT'
GROUP BY 1, 2;

CREATE UNIQUE INDEX "mv_sales_daily_key" ON "mv_sales_daily" ("storeId", "day");
COMMENT ON MATERIALIZED VIEW "mv_sales_daily" IS
  'PR 603: daily sales per store. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.';

-- Profit by style per month (PR 536): delivered lines, gross margin, and each order's courier, gateway, packaging,
-- AI/SMS and ad costs apportioned to its lines by revenue share. Roll-ups to Polo → brand polo use StyleGroup.ancestorIds.
CREATE MATERIALIZED VIEW "mv_style_profit_monthly" AS
SELECT
  oi."storeId"                                                             AS "storeId",
  date_trunc('month', o."placedAt" AT TIME ZONE s."timezone")::date        AS "month",
  p."styleGroupId"                                                         AS "styleGroupId",
  sum(oi."quantity")::bigint                                               AS "units",
  sum(oi."lineTotalMinor")::bigint                                         AS "revenueMinor",
  COALESCE(sum(oi."unitCostMinor"::bigint * oi."quantity"), 0)::bigint     AS "cogsMinor",
  COALESCE(round(sum(
    oi."lineTotalMinor"::numeric / NULLIF(op."revenueMinor", 0)
    * (op."courierMinor" + op."gatewayMinor" + op."packagingMinor" + op."aiSmsMinor" + op."adSpendMinor")
  )), 0)::bigint                                                           AS "allocatedCostMinor",
  (sum(oi."lineTotalMinor")
    - COALESCE(sum(oi."unitCostMinor"::bigint * oi."quantity"), 0)
    - COALESCE(round(sum(
        oi."lineTotalMinor"::numeric / NULLIF(op."revenueMinor", 0)
        * (op."courierMinor" + op."gatewayMinor" + op."packagingMinor" + op."aiSmsMinor" + op."adSpendMinor")
      )), 0))::bigint                                                      AS "profitMinor"
FROM "OrderItem" oi
JOIN "Order" o        ON o."id" = oi."orderId"
JOIN "Store" s        ON s."id" = o."storeId"
LEFT JOIN "Product" p ON p."id" = oi."productId"
LEFT JOIN "OrderProfit" op ON op."orderId" = o."id"
WHERE o."status" = 'DELIVERED' AND oi."status" = 'ACTIVE' AND o."archivedAt" IS NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX "mv_style_profit_monthly_key" ON "mv_style_profit_monthly" ("storeId", "month", "styleGroupId") NULLS NOT DISTINCT;
COMMENT ON MATERIALIZED VIEW "mv_style_profit_monthly" IS
  'PR 536/603: profit by style per month. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.';

-- Ads per store, day and platform (B3.10, PR 283): spend against orders and delivered revenue attributed to the platform.
CREATE MATERIALIZED VIEW "mv_ad_performance_daily" AS
WITH spend AS (
  SELECT a."storeId", a."date" AS "day", a."platform"::text AS "platform",
         COALESCE(sum(a."spendStoreMinor"), 0)::bigint AS "spendMinor",
         sum(a."impressions")::bigint AS "impressions",
         sum(a."clicks")::bigint AS "clicks"
  FROM "AdSpendDaily" a
  GROUP BY 1, 2, 3
), attributed AS (
  SELECT o."storeId", (o."placedAt" AT TIME ZONE s."timezone")::date AS "day", o."adPlatform" AS "platform",
         count(*) AS "orders",
         count(*) FILTER (WHERE o."status" = 'DELIVERED') AS "deliveredOrders",
         COALESCE(sum(o."totalMinor") FILTER (WHERE o."status" = 'DELIVERED'), 0)::bigint AS "deliveredRevenueMinor"
  FROM "Order" o
  JOIN "Store" s ON s."id" = o."storeId"
  WHERE o."adPlatform" IS NOT NULL AND o."archivedAt" IS NULL AND o."status" <> 'DRAFT'
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(sp."storeId", at."storeId")   AS "storeId",
  COALESCE(sp."day", at."day")           AS "day",
  COALESCE(sp."platform", at."platform") AS "platform",
  COALESCE(sp."spendMinor", 0)           AS "spendMinor",
  COALESCE(sp."impressions", 0)          AS "impressions",
  COALESCE(sp."clicks", 0)               AS "clicks",
  COALESCE(at."orders", 0)               AS "orders",
  COALESCE(at."deliveredOrders", 0)      AS "deliveredOrders",
  COALESCE(at."deliveredRevenueMinor", 0) AS "deliveredRevenueMinor"
FROM spend sp
FULL OUTER JOIN attributed at
  ON at."storeId" = sp."storeId" AND at."day" = sp."day" AND at."platform" = sp."platform";

CREATE UNIQUE INDEX "mv_ad_performance_daily_key" ON "mv_ad_performance_daily" ("storeId", "day", "platform");
COMMENT ON MATERIALIZED VIEW "mv_ad_performance_daily" IS
  'PR 603: ad spend vs delivered revenue per day and platform. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.';

-- Product and category sales by district and upazila/thana per month (PR 568, 569).
CREATE MATERIALIZED VIEW "mv_district_sales_monthly" AS
SELECT
  oi."storeId"                                                       AS "storeId",
  date_trunc('month', o."placedAt" AT TIME ZONE s."timezone")::date  AS "month",
  geo."districtId"                                                   AS "districtId",
  geo."upazilaId"                                                    AS "upazilaId",
  p."categoryId"                                                     AS "categoryId",
  count(DISTINCT o."id")                                             AS "orders",
  count(DISTINCT o."id") FILTER (WHERE o."status" = 'DELIVERED')     AS "deliveredOrders",
  count(DISTINCT o."id") FILTER (WHERE o."status" = 'RETURNED')      AS "returnedOrders",
  sum(oi."quantity")::bigint                                         AS "units",
  sum(oi."lineTotalMinor")::bigint                                   AS "revenueMinor"
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
JOIN "Store" s ON s."id" = o."storeId"
LEFT JOIN "Product" p ON p."id" = oi."productId"
LEFT JOIN "GeoArea" a ON a."id" = o."areaId"
LEFT JOIN LATERAL (
  SELECT
    (SELECT d."id" FROM "GeoArea" d
      WHERE d."level" = 'DISTRICT' AND (d."id" = a."id" OR d."id" = ANY (a."ancestorIds")) LIMIT 1) AS "districtId",
    (SELECT u."id" FROM "GeoArea" u
      WHERE u."level" IN ('UPAZILA', 'THANA') AND (u."id" = a."id" OR u."id" = ANY (a."ancestorIds")) LIMIT 1) AS "upazilaId"
) geo ON true
WHERE o."archivedAt" IS NULL AND o."status" NOT IN ('DRAFT', 'CANCELLED') AND oi."status" = 'ACTIVE'
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX "mv_district_sales_monthly_key"
  ON "mv_district_sales_monthly" ("storeId", "month", "districtId", "upazilaId", "categoryId") NULLS NOT DISTINCT;
COMMENT ON MATERIALIZED VIEW "mv_district_sales_monthly" IS
  'PR 568/603: sales by district and upazila per month. Refreshed CONCURRENTLY by job reports.refresh-views every reports.viewRefreshMinutes.';

-- One call refreshes every report view without blocking readers. Called only by the reports.refresh-views job.
CREATE FUNCTION "extas_refresh_report_views"() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_sales_daily";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_style_profit_monthly";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_ad_performance_daily";
  REFRESH MATERIALIZED VIEW CONCURRENTLY "mv_district_sales_monthly";
END;
$$;
