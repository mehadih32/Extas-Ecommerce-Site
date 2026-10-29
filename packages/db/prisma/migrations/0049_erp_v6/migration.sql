-- PR 607–618 (CN-028, CN-029 Phase 0): Retail as a separate buyer of the ERP (docs/RETAIL-ERP-MODEL.md,
-- docs/erp/site-changes-v6.md). ONE migration with every new table and column of the run, so the five lanes of Phase 1
-- never change the schema at the same moment. Everything is behind the setting `erp.model` (v5 until the ERP's switch
-- date): in v5 nothing reads or writes these tables, and the v5 flow is unchanged.
-- Everything is added; nothing is dropped, renamed or removed (CLAUDE.md rule 3).
--
-- RESERVED MIGRATION NUMBERS (CN-029 §15): a lane that needs a further change to the schema uses ONLY its own number,
-- so no two lanes ever pick the same one. 0050 and 0051 are held by two agents outside the ERP run.
--   0052  Bhandari  (PR 609, 620)
--   0053  Sawdagor  (PR 610, 611)
--   0054  Pherot    (PR 612, 613, 614; rework of PR 184–191, 525, 526)
--   0055  Gyani     (PR 615, 616)
--   0056  Hisabi    (PR 617, 618)
--   0057  Prohori   (PR 619, 621)
--
-- WHAT IS HERE, BY PR
--   607  ErpPushStatus RETIRED (a v5 call v6 retired: kept, never sent); ErpStoreLink (§16: one store = one ERP company,
--        its own connection, switch date and opening balance; a handover starts a new link; no secret is ever stored:
--        the store's API key, webhook secret and signing secret live only in the vault under the store's id).
--   608  ErpEvent (the event ledger, per store and link, each eventId once forever; its body is fixed below) and
--        ErpClaim (courier claims).
--   609  ErpGrade; Product.erpGrade; ProductVariant grade and the buying price (shopPriceMinor, shopPricePrevMinor,
--        shopPriceChangedAt, shopPriceSeenAt).
--   610  ErpPushStatus HELD; ErpOrder, ErpOrderLine (lineId, customer price, shop price, the short line and its
--        decision); ErpAccountState (the ERP's last word on the account and its hold); ProductVariant.shopPriceMissingAt.
--   611  ErpOrder pickup and identification columns; ErpDeliveryResult (every courier result sent, partial box).
--   612  ErpReturnList, ErpReturnListParcel (hand-back counts, note, sealed-bag photo, claim start).
--   614  ErpExchangeLink, ErpExchangeLine.
--   615  ErpAccountEntry (the ERP account ledger: hash chain, eventId unique forever), ErpPaymentRecord ("paid to ERP"),
--        ErpPipelinePiece and ErpPipelineMove (the pipeline stock).
--   616  BooksMatchRun, BooksDayClose, BooksPeriodClose, BooksDifference, BooksDifferenceNote, BooksAdjustment.
--   617  ErpDailySummary (every version built), ErpBooksSend (every send and the ERP's reply).
--   618  ErpFixedCostMonth (every version); CostSummaryLine on CostEntry and ExpenseHead (the extra cost lines).
-- Every row carries its store (A4.1); the ledgers and closes also carry the store's ERP link, by a composite foreign key
-- (linkId, storeId) → ErpStoreLink(id, storeId), so a row can never sit on another store's link. Lump sums of money are
-- BIGINT (minor units; INTEGER ends at 21,474,836.47 taka); the price of one piece stays INTEGER. A reversal is unique
-- per original (ErpAccountEntry linkId+reverses, ErpPaymentRecord and BooksAdjustment reversesId; BooksAdjustment one
-- per ERP event). Two stores' open links never hold one ERP company (openErpCompanyId, kept by the trigger at the end).

-- CreateEnum
CREATE TYPE "ErpGrade" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "ErpEventSource" AS ENUM ('WEBHOOK', 'PULL');

-- CreateEnum
CREATE TYPE "ErpEventStatus" AS ENUM ('RECEIVED', 'APPLIED', 'STORED', 'WAITING_ORIGINAL', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "ErpClaimStatus" AS ENUM ('OPEN', 'REVERSED');

-- CreateEnum
CREATE TYPE "ErpLineState" AS ENUM ('OPEN', 'SHORT', 'CANCELLED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ErpLineAction" AS ENUM ('WAIT', 'REPLACE', 'CANCEL');

-- CreateEnum
CREATE TYPE "ErpDeliveryOutcome" AS ENUM ('DELIVERED', 'PARTIAL', 'RETURNED');

-- CreateEnum
CREATE TYPE "ErpAccountEntryKind" AS ENUM ('BILL', 'EXCHANGE_EXTRA', 'EXCHANGE_ADJUSTMENT', 'EXCHANGE_BILL', 'EXCHANGE_CREDIT', 'RETURN_CREDIT', 'PAYMENT', 'SWITCH_TRANSFER', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ErpEntrySource" AS ENUM ('WEBHOOK', 'PULL', 'ANSWER', 'MANUAL', 'SWITCH');

-- CreateEnum
CREATE TYPE "ErpPieceState" AS ENUM ('BILLED', 'RETURNING', 'WAITING_CHECK', 'DELIVERED', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ErpReturnListStatus" AS ENUM ('OPEN', 'SENT', 'ACCEPTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "ErpBooksSendKind" AS ENUM ('DAILY_SUMMARY', 'FIXED_COSTS');

-- CreateEnum
CREATE TYPE "BooksRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "BooksPeriodLevel" AS ENUM ('WEEK', 'MONTH', 'YEAR', 'LIFETIME');

-- CreateEnum
CREATE TYPE "BooksResult" AS ENUM ('MATCHED', 'PARTIAL', 'PENDING', 'MISMATCH');

-- CreateEnum
CREATE TYPE "BooksCheck" AS ENUM ('ACCOUNT', 'TIES', 'RETURNS', 'SUMMARY', 'FIXED_COSTS', 'ORDERS');

-- CreateEnum
CREATE TYPE "BooksDifferenceClass" AS ENUM ('MISSING_EVENT', 'UNKNOWN_ROW', 'AMOUNT_DIFF', 'UNMATCHED_PAYMENT', 'TIE_BROKEN', 'STALE_SUMMARY', 'HISTORY_CHANGED');

-- CreateEnum
CREATE TYPE "BooksDifferenceStatus" AS ENUM ('PENDING', 'MISMATCH', 'FIXED', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "BooksAdjustmentKind" AS ENUM ('ADJUSTMENT', 'PRIOR_PERIOD');

-- CreateEnum
CREATE TYPE "CostSummaryLine" AS ENUM ('PACKAGING', 'ACCESSORIES', 'PAYMENT_FEES', 'DELIVERY', 'ADS_FACEBOOK', 'ADS_INSTAGRAM', 'ADS_GOOGLE', 'ADS_TIKTOK', 'ADS_OTHER', 'OTHER');

-- AlterEnum (PR 607 RETIRED, PR 610 HELD; PostgreSQL 12 and later add both in one migration)
ALTER TYPE "ErpPushStatus" ADD VALUE 'RETIRED';
ALTER TYPE "ErpPushStatus" ADD VALUE 'HELD';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "erpGrade" "ErpGrade" NOT NULL DEFAULT 'A';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "grade" "ErpGrade" NOT NULL DEFAULT 'A',
ADD COLUMN     "shopPriceChangedAt" TIMESTAMPTZ(3),
ADD COLUMN     "shopPriceMinor" INTEGER,
ADD COLUMN     "shopPriceMissingAt" TIMESTAMPTZ(3),
ADD COLUMN     "shopPricePrevMinor" INTEGER,
ADD COLUMN     "shopPriceSeenAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "CostEntry" ADD COLUMN     "costDate" DATE,
ADD COLUMN     "summaryLine" "CostSummaryLine";

-- AlterTable
ALTER TABLE "ExpenseHead" ADD COLUMN     "summaryLine" "CostSummaryLine";

-- CreateTable
CREATE TABLE "ErpEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" "ErpEventSource" NOT NULL,
    "status" "ErpEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "moneyEvent" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMPTZ(3),
    "businessDate" DATE,
    "reverses" TEXT,
    "reversedBy" TEXT,
    "externalOrderId" TEXT,
    "data" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "rawBodyHash" TEXT,
    "conflictCount" INTEGER NOT NULL DEFAULT 0,
    "conflictAt" TIMESTAMPTZ(3),
    "conflictHash" TEXT,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpClaim" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL DEFAULT '',
    "sku" TEXT,
    "reason" TEXT NOT NULL,
    "returnListId" TEXT,
    "consignmentId" TEXT,
    "courier" TEXT,
    "handedBackAt" DATE,
    "decidedAt" DATE,
    "valueMinor" BIGINT,
    "source" "ErpEventSource" NOT NULL,
    "eventId" TEXT,
    "status" "ErpClaimStatus" NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpStoreLink" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 1,
    "integrationId" UUID,
    "erpCompanyId" TEXT,
    "openErpCompanyId" TEXT,
    "switchDate" DATE,
    "dryRunAt" TIMESTAMPTZ(3),
    "switchedAt" TIMESTAMPTZ(3),
    "openingBalanceMinor" BIGINT,
    "openingBalanceDate" DATE,
    "openingImportedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpStoreLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpOrder" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "erpOrderId" TEXT,
    "exchangeOfId" UUID,
    "erpTotalMinor" BIGINT,
    "acceptedAt" TIMESTAMPTZ(3),
    "refusal" TEXT,
    "refusalDetails" JSONB,
    "refusedAt" TIMESTAMPTZ(3),
    "consignmentId" TEXT,
    "courier" TEXT,
    "pickedUpAt" TIMESTAMPTZ(3),
    "shipmentSentAt" TIMESTAMPTZ(3),
    "billedAt" TIMESTAMPTZ(3),
    "identification" TEXT,
    "identifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpOrderLine" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "erpOrderId" UUID NOT NULL,
    "orderItemId" UUID,
    "piece" INTEGER NOT NULL DEFAULT 1,
    "lineId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "grade" "ErpGrade" NOT NULL DEFAULT 'A',
    "customerPriceMinor" INTEGER NOT NULL,
    "comboId" UUID,
    "replacesLineId" TEXT,
    "shopPriceMinor" INTEGER,
    "fromReturnStock" BOOLEAN NOT NULL DEFAULT false,
    "state" "ErpLineState" NOT NULL DEFAULT 'OPEN',
    "shortReason" TEXT,
    "shortAt" TIMESTAMPTZ(3),
    "filledAt" TIMESTAMPTZ(3),
    "decision" "ErpLineAction",
    "decisionSku" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpDeliveryResult" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "erpOrderId" UUID NOT NULL,
    "outcome" "ErpDeliveryOutcome" NOT NULL,
    "courier" TEXT NOT NULL,
    "consignmentId" TEXT,
    "collectedMinor" BIGINT NOT NULL DEFAULT 0,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "keptLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discountGivenMinor" BIGINT NOT NULL DEFAULT 0,
    "phoneConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "markedById" UUID,
    "sentAt" TIMESTAMPTZ(3),
    "answer" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpDeliveryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpAccountState" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "holdsOn" DATE,
    "warnFromDays" INTEGER,
    "lastPaymentAt" DATE,
    "daysSinceLastPayment" INTEGER,
    "balanceMinor" BIGINT,
    "waitingCheckMinor" BIGINT,
    "exchangesAtRiskMinor" BIGINT,
    "heldAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "checkedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpAccountState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpAccountEntry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "ErpAccountEntryKind" NOT NULL,
    "eventId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "externalOrderId" TEXT,
    "lineId" TEXT,
    "returnListId" TEXT,
    "consignmentId" TEXT,
    "exchangeId" TEXT,
    "paymentRef" TEXT,
    "source" "ErpEntrySource" NOT NULL,
    "reverses" TEXT,
    "erpEventRowId" UUID,
    "adjustmentId" UUID,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpAccountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpPaymentRecord" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "paidOn" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "reversesId" UUID,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpPaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpPipelinePiece" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "orderId" UUID,
    "externalOrderId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "buyingPriceMinor" INTEGER NOT NULL,
    "state" "ErpPieceState" NOT NULL,
    "billedOn" DATE NOT NULL,
    "stateDate" DATE NOT NULL,
    "exchangeId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpPipelinePiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpPipelineMove" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "pieceId" UUID NOT NULL,
    "fromState" "ErpPieceState",
    "toState" "ErpPieceState" NOT NULL,
    "businessDate" DATE NOT NULL,
    "buyingPriceMinor" INTEGER NOT NULL,
    "cause" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpPipelineMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpReturnList" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "returnListId" TEXT NOT NULL,
    "courier" TEXT NOT NULL,
    "handedBackAt" DATE NOT NULL,
    "status" "ErpReturnListStatus" NOT NULL DEFAULT 'OPEN',
    "sentAt" TIMESTAMPTZ(3),
    "answer" JSONB,
    "error" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpReturnList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpReturnListParcel" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "returnListId" UUID NOT NULL,
    "orderId" UUID,
    "externalOrderId" TEXT NOT NULL,
    "consignmentId" TEXT,
    "expectedCount" INTEGER,
    "receivedCount" INTEGER NOT NULL,
    "note" TEXT,
    "photoAssetId" UUID,
    "result" TEXT,
    "countDiffers" BOOLEAN NOT NULL DEFAULT false,
    "claimStartedAt" TIMESTAMPTZ(3),
    "scannedById" UUID,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpReturnListParcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpExchangeLink" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "exchangeId" UUID NOT NULL,
    "erpExchangeId" TEXT,
    "ofExternalOrderId" TEXT NOT NULL,
    "newExternalOrderId" TEXT,
    "erpStatus" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedById" UUID,
    "customerPaysMinor" BIGINT NOT NULL DEFAULT 0,
    "newDeliveredAt" TIMESTAMPTZ(3),
    "returnWatchUntil" TIMESTAMPTZ(3),
    "lateReturnMarkedAt" TIMESTAMPTZ(3),
    "valueAtRiskMinor" BIGINT,
    "settledKind" TEXT,
    "settledAmountMinor" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpExchangeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpExchangeLine" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "exchangeLinkId" UUID NOT NULL,
    "oldLineId" TEXT NOT NULL,
    "oldSku" TEXT NOT NULL,
    "newLineId" TEXT,
    "newSku" TEXT NOT NULL,
    "oldPriceMinor" INTEGER NOT NULL,
    "newPriceMinor" INTEGER NOT NULL,
    "newShopPriceMinor" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ErpExchangeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpDailySummary" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "bodyHash" TEXT NOT NULL,
    "incomplete" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "netProfitMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpFixedCostMonth" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "salaryMinor" BIGINT NOT NULL,
    "rentMinor" BIGINT NOT NULL,
    "utilitiesMinor" BIGINT NOT NULL,
    "otherMinor" BIGINT NOT NULL,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpFixedCostMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpBooksSend" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "kind" "ErpBooksSendKind" NOT NULL,
    "refId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL,
    "httpStatus" INTEGER,
    "accepted" BOOLEAN NOT NULL,
    "answer" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErpBooksSend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksMatchRun" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "trigger" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "status" "BooksRunStatus" NOT NULL DEFAULT 'RUNNING',
    "checks" JSONB,
    "differences" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedById" UUID,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BooksMatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksDayClose" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "result" "BooksResult" NOT NULL,
    "runId" UUID,
    "openingBalanceMinor" BIGINT NOT NULL,
    "closingBalanceMinor" BIGINT NOT NULL,
    "erpClosingBalanceMinor" BIGINT,
    "goodsMinor" BIGINT NOT NULL,
    "returnLossesMinor" BIGINT NOT NULL,
    "pipelineStartMinor" BIGINT NOT NULL,
    "pipelineEndMinor" BIGINT NOT NULL,
    "switchTransferMinor" BIGINT NOT NULL DEFAULT 0,
    "paymentsMinor" BIGINT NOT NULL,
    "tieRemainderMinor" BIGINT NOT NULL,
    "waitingCheckMinor" BIGINT NOT NULL DEFAULT 0,
    "exchangesAtRiskMinor" BIGINT NOT NULL DEFAULT 0,
    "figures" JSONB NOT NULL,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "closedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BooksDayClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksPeriodClose" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "level" "BooksPeriodLevel" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "result" "BooksResult" NOT NULL,
    "openingBalanceMinor" BIGINT NOT NULL,
    "closingBalanceMinor" BIGINT NOT NULL,
    "matchedDays" INTEGER NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "figures" JSONB NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "reopens" INTEGER,
    "pinVerified" BOOLEAN NOT NULL DEFAULT false,
    "closedById" UUID,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BooksPeriodClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksDifference" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "check" "BooksCheck" NOT NULL,
    "kind" "BooksDifferenceClass" NOT NULL,
    "key" TEXT NOT NULL,
    "status" "BooksDifferenceStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" BIGINT,
    "eventId" TEXT,
    "externalOrderId" TEXT,
    "detail" JSONB NOT NULL,
    "firstRunId" UUID,
    "lastRunId" UUID,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "fixedAt" TIMESTAMPTZ(3),
    "adjustmentId" UUID,
    "entryId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BooksDifference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksDifferenceNote" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "differenceId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BooksDifferenceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BooksAdjustment" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "linkId" UUID NOT NULL,
    "kind" "BooksAdjustmentKind" NOT NULL,
    "date" DATE NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "erpEventId" TEXT NOT NULL,
    "differenceId" UUID,
    "reversesId" UUID,
    "pinVerified" BOOLEAN NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BooksAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpEvent_status_receivedAt_idx" ON "ErpEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "ErpEvent_linkId_reverses_idx" ON "ErpEvent"("linkId", "reverses");

-- CreateIndex
CREATE INDEX "ErpEvent_storeId_type_businessDate_idx" ON "ErpEvent"("storeId", "type", "businessDate");

-- CreateIndex
CREATE INDEX "ErpEvent_storeId_externalOrderId_idx" ON "ErpEvent"("storeId", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpEvent_linkId_eventId_key" ON "ErpEvent"("linkId", "eventId");

-- CreateIndex
CREATE INDEX "ErpClaim_storeId_status_handedBackAt_idx" ON "ErpClaim"("storeId", "status", "handedBackAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpClaim_linkId_externalOrderId_lineId_reason_key" ON "ErpClaim"("linkId", "externalOrderId", "lineId", "reason");

-- CreateIndex
CREATE UNIQUE INDEX "ErpStoreLink_openErpCompanyId_key" ON "ErpStoreLink"("openErpCompanyId");

-- CreateIndex
CREATE INDEX "ErpStoreLink_storeId_endedAt_idx" ON "ErpStoreLink"("storeId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpStoreLink_storeId_epoch_key" ON "ErpStoreLink"("storeId", "epoch");

-- CreateIndex
CREATE UNIQUE INDEX "ErpStoreLink_id_storeId_key" ON "ErpStoreLink"("id", "storeId");

-- CreateIndex
CREATE INDEX "ErpOrder_storeId_billedAt_idx" ON "ErpOrder"("storeId", "billedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpOrder_linkId_externalOrderId_key" ON "ErpOrder"("linkId", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpOrder_linkId_orderId_key" ON "ErpOrder"("linkId", "orderId");

-- CreateIndex
CREATE INDEX "ErpOrderLine_storeId_state_idx" ON "ErpOrderLine"("storeId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ErpOrderLine_erpOrderId_lineId_key" ON "ErpOrderLine"("erpOrderId", "lineId");

-- CreateIndex
CREATE INDEX "ErpDeliveryResult_storeId_at_idx" ON "ErpDeliveryResult"("storeId", "at");

-- CreateIndex
CREATE INDEX "ErpDeliveryResult_erpOrderId_idx" ON "ErpDeliveryResult"("erpOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpAccountState_linkId_key" ON "ErpAccountState"("linkId");

-- CreateIndex
CREATE INDEX "ErpAccountState_storeId_idx" ON "ErpAccountState"("storeId");

-- CreateIndex
CREATE INDEX "ErpAccountEntry_storeId_businessDate_idx" ON "ErpAccountEntry"("storeId", "businessDate");

-- CreateIndex
CREATE INDEX "ErpAccountEntry_linkId_kind_businessDate_idx" ON "ErpAccountEntry"("linkId", "kind", "businessDate");

-- CreateIndex
CREATE INDEX "ErpAccountEntry_linkId_externalOrderId_idx" ON "ErpAccountEntry"("linkId", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpAccountEntry_linkId_eventId_key" ON "ErpAccountEntry"("linkId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpAccountEntry_linkId_seq_key" ON "ErpAccountEntry"("linkId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ErpAccountEntry_linkId_reverses_key" ON "ErpAccountEntry"("linkId", "reverses");

-- CreateIndex
CREATE UNIQUE INDEX "ErpPaymentRecord_reversesId_key" ON "ErpPaymentRecord"("reversesId");

-- CreateIndex
CREATE INDEX "ErpPaymentRecord_storeId_paidOn_idx" ON "ErpPaymentRecord"("storeId", "paidOn");

-- CreateIndex
CREATE INDEX "ErpPaymentRecord_linkId_reference_idx" ON "ErpPaymentRecord"("linkId", "reference");

-- CreateIndex
CREATE INDEX "ErpPipelinePiece_storeId_state_idx" ON "ErpPipelinePiece"("storeId", "state");

-- CreateIndex
CREATE INDEX "ErpPipelinePiece_linkId_state_stateDate_idx" ON "ErpPipelinePiece"("linkId", "state", "stateDate");

-- CreateIndex
CREATE UNIQUE INDEX "ErpPipelinePiece_linkId_externalOrderId_lineId_key" ON "ErpPipelinePiece"("linkId", "externalOrderId", "lineId");

-- CreateIndex
CREATE INDEX "ErpPipelineMove_linkId_businessDate_idx" ON "ErpPipelineMove"("linkId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ErpPipelineMove_pieceId_cause_key" ON "ErpPipelineMove"("pieceId", "cause");

-- CreateIndex
CREATE INDEX "ErpReturnList_storeId_status_handedBackAt_idx" ON "ErpReturnList"("storeId", "status", "handedBackAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErpReturnList_linkId_returnListId_key" ON "ErpReturnList"("linkId", "returnListId");

-- CreateIndex
CREATE INDEX "ErpReturnListParcel_storeId_consignmentId_idx" ON "ErpReturnListParcel"("storeId", "consignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpReturnListParcel_returnListId_externalOrderId_key" ON "ErpReturnListParcel"("returnListId", "externalOrderId");

-- CreateIndex
CREATE INDEX "ErpExchangeLink_storeId_erpStatus_idx" ON "ErpExchangeLink"("storeId", "erpStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ErpExchangeLink_linkId_exchangeId_key" ON "ErpExchangeLink"("linkId", "exchangeId");

-- CreateIndex
CREATE UNIQUE INDEX "ErpExchangeLine_exchangeLinkId_oldLineId_key" ON "ErpExchangeLine"("exchangeLinkId", "oldLineId");

-- CreateIndex
CREATE INDEX "ErpDailySummary_storeId_date_idx" ON "ErpDailySummary"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ErpDailySummary_linkId_date_version_key" ON "ErpDailySummary"("linkId", "date", "version");

-- CreateIndex
CREATE INDEX "ErpFixedCostMonth_storeId_month_idx" ON "ErpFixedCostMonth"("storeId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ErpFixedCostMonth_linkId_month_version_key" ON "ErpFixedCostMonth"("linkId", "month", "version");

-- CreateIndex
CREATE INDEX "ErpBooksSend_storeId_kind_sentAt_idx" ON "ErpBooksSend"("storeId", "kind", "sentAt");

-- CreateIndex
CREATE INDEX "ErpBooksSend_refId_idx" ON "ErpBooksSend"("refId");

-- CreateIndex
CREATE INDEX "BooksMatchRun_storeId_startedAt_idx" ON "BooksMatchRun"("storeId", "startedAt");

-- CreateIndex
CREATE INDEX "BooksDayClose_storeId_date_idx" ON "BooksDayClose"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BooksDayClose_linkId_date_version_key" ON "BooksDayClose"("linkId", "date", "version");

-- CreateIndex
CREATE INDEX "BooksPeriodClose_storeId_level_periodStart_idx" ON "BooksPeriodClose"("storeId", "level", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "BooksPeriodClose_linkId_level_periodStart_version_key" ON "BooksPeriodClose"("linkId", "level", "periodStart", "version");

-- CreateIndex
CREATE INDEX "BooksDifference_storeId_status_date_idx" ON "BooksDifference"("storeId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BooksDifference_linkId_date_kind_key_key" ON "BooksDifference"("linkId", "date", "kind", "key");

-- CreateIndex
CREATE INDEX "BooksDifferenceNote_differenceId_idx" ON "BooksDifferenceNote"("differenceId");

-- CreateIndex
CREATE UNIQUE INDEX "BooksAdjustment_reversesId_key" ON "BooksAdjustment"("reversesId");

-- CreateIndex
CREATE INDEX "BooksAdjustment_storeId_date_idx" ON "BooksAdjustment"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BooksAdjustment_linkId_erpEventId_key" ON "BooksAdjustment"("linkId", "erpEventId");

-- CreateIndex
CREATE INDEX "ProductVariant_storeId_shopPriceChangedAt_idx" ON "ProductVariant"("storeId", "shopPriceChangedAt");

-- CreateIndex
CREATE INDEX "CostEntry_storeId_summaryLine_costDate_idx" ON "CostEntry"("storeId", "summaryLine", "costDate");

-- AddForeignKey
ALTER TABLE "ErpEvent" ADD CONSTRAINT "ErpEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpEvent" ADD CONSTRAINT "ErpEvent_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpClaim" ADD CONSTRAINT "ErpClaim_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpClaim" ADD CONSTRAINT "ErpClaim_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpStoreLink" ADD CONSTRAINT "ErpStoreLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpOrder" ADD CONSTRAINT "ErpOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpOrder" ADD CONSTRAINT "ErpOrder_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpOrderLine" ADD CONSTRAINT "ErpOrderLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpOrderLine" ADD CONSTRAINT "ErpOrderLine_erpOrderId_fkey" FOREIGN KEY ("erpOrderId") REFERENCES "ErpOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDeliveryResult" ADD CONSTRAINT "ErpDeliveryResult_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDeliveryResult" ADD CONSTRAINT "ErpDeliveryResult_erpOrderId_fkey" FOREIGN KEY ("erpOrderId") REFERENCES "ErpOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpAccountState" ADD CONSTRAINT "ErpAccountState_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpAccountState" ADD CONSTRAINT "ErpAccountState_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpAccountEntry" ADD CONSTRAINT "ErpAccountEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpAccountEntry" ADD CONSTRAINT "ErpAccountEntry_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPaymentRecord" ADD CONSTRAINT "ErpPaymentRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPaymentRecord" ADD CONSTRAINT "ErpPaymentRecord_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPipelinePiece" ADD CONSTRAINT "ErpPipelinePiece_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPipelinePiece" ADD CONSTRAINT "ErpPipelinePiece_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPipelineMove" ADD CONSTRAINT "ErpPipelineMove_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPipelineMove" ADD CONSTRAINT "ErpPipelineMove_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpPipelineMove" ADD CONSTRAINT "ErpPipelineMove_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ErpPipelinePiece"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpReturnList" ADD CONSTRAINT "ErpReturnList_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpReturnList" ADD CONSTRAINT "ErpReturnList_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpReturnListParcel" ADD CONSTRAINT "ErpReturnListParcel_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpReturnListParcel" ADD CONSTRAINT "ErpReturnListParcel_returnListId_fkey" FOREIGN KEY ("returnListId") REFERENCES "ErpReturnList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpExchangeLink" ADD CONSTRAINT "ErpExchangeLink_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpExchangeLink" ADD CONSTRAINT "ErpExchangeLink_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpExchangeLine" ADD CONSTRAINT "ErpExchangeLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpExchangeLine" ADD CONSTRAINT "ErpExchangeLine_exchangeLinkId_fkey" FOREIGN KEY ("exchangeLinkId") REFERENCES "ErpExchangeLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDailySummary" ADD CONSTRAINT "ErpDailySummary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpDailySummary" ADD CONSTRAINT "ErpDailySummary_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpFixedCostMonth" ADD CONSTRAINT "ErpFixedCostMonth_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpFixedCostMonth" ADD CONSTRAINT "ErpFixedCostMonth_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpBooksSend" ADD CONSTRAINT "ErpBooksSend_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpBooksSend" ADD CONSTRAINT "ErpBooksSend_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksMatchRun" ADD CONSTRAINT "BooksMatchRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksMatchRun" ADD CONSTRAINT "BooksMatchRun_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDayClose" ADD CONSTRAINT "BooksDayClose_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDayClose" ADD CONSTRAINT "BooksDayClose_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksPeriodClose" ADD CONSTRAINT "BooksPeriodClose_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksPeriodClose" ADD CONSTRAINT "BooksPeriodClose_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDifference" ADD CONSTRAINT "BooksDifference_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDifference" ADD CONSTRAINT "BooksDifference_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDifferenceNote" ADD CONSTRAINT "BooksDifferenceNote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksDifferenceNote" ADD CONSTRAINT "BooksDifferenceNote_differenceId_fkey" FOREIGN KEY ("differenceId") REFERENCES "BooksDifference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksAdjustment" ADD CONSTRAINT "BooksAdjustment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BooksAdjustment" ADD CONSTRAINT "BooksAdjustment_linkId_storeId_fkey" FOREIGN KEY ("linkId", "storeId") REFERENCES "ErpStoreLink"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- =====================================================================================================================
-- APPEND-ONLY AT THE DATABASE (as migration 0010_append_only, PR 139). The ledgers, the closes, the adjustments and the
-- logs of what was sent: the app's role (extas_app) may only INSERT and SELECT them, and a trigger refuses UPDATE,
-- DELETE and TRUNCATE for every role. A correction is a reversing row plus a new row (docs/RETAIL-ERP-MODEL.md §4.3).
-- The list is packages/db/src/schema-meta.ts APPEND_ONLY_LOCKED.
-- =====================================================================================================================

-- ErpAccountEntry (PR 615): Retail's ERP account, one entry per ERP event, hash-chained.
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpAccountEntry" FROM extas_app;
CREATE TRIGGER "ErpAccountEntry_append_only" BEFORE UPDATE OR DELETE ON "ErpAccountEntry" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpAccountEntry_no_truncate" BEFORE TRUNCATE ON "ErpAccountEntry" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ErpPaymentRecord (PR 615): "paid to ERP", put right only by a reversing record.
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpPaymentRecord" FROM extas_app;
CREATE TRIGGER "ErpPaymentRecord_append_only" BEFORE UPDATE OR DELETE ON "ErpPaymentRecord" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpPaymentRecord_no_truncate" BEFORE TRUNCATE ON "ErpPaymentRecord" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ErpPipelineMove (PR 615): every move of a billed piece.
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpPipelineMove" FROM extas_app;
CREATE TRIGGER "ErpPipelineMove_append_only" BEFORE UPDATE OR DELETE ON "ErpPipelineMove" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpPipelineMove_no_truncate" BEFORE TRUNCATE ON "ErpPipelineMove" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- BooksDayClose, BooksPeriodClose (PR 616): immutable closes; a re-close is a new version.
REVOKE UPDATE, DELETE, TRUNCATE ON "BooksDayClose" FROM extas_app;
CREATE TRIGGER "BooksDayClose_append_only" BEFORE UPDATE OR DELETE ON "BooksDayClose" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BooksDayClose_no_truncate" BEFORE TRUNCATE ON "BooksDayClose" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "BooksPeriodClose" FROM extas_app;
CREATE TRIGGER "BooksPeriodClose_append_only" BEFORE UPDATE OR DELETE ON "BooksPeriodClose" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BooksPeriodClose_no_truncate" BEFORE TRUNCATE ON "BooksPeriodClose" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- BooksDifferenceNote, BooksAdjustment (PR 616): notes and shop corrections (PIN, reason, the ERP's matching event).
REVOKE UPDATE, DELETE, TRUNCATE ON "BooksDifferenceNote" FROM extas_app;
CREATE TRIGGER "BooksDifferenceNote_append_only" BEFORE UPDATE OR DELETE ON "BooksDifferenceNote" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BooksDifferenceNote_no_truncate" BEFORE TRUNCATE ON "BooksDifferenceNote" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "BooksAdjustment" FROM extas_app;
CREATE TRIGGER "BooksAdjustment_append_only" BEFORE UPDATE OR DELETE ON "BooksAdjustment" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BooksAdjustment_no_truncate" BEFORE TRUNCATE ON "BooksAdjustment" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ErpDailySummary, ErpFixedCostMonth, ErpBooksSend (PR 617, 618): every version built and every send with its reply.
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpDailySummary" FROM extas_app;
CREATE TRIGGER "ErpDailySummary_append_only" BEFORE UPDATE OR DELETE ON "ErpDailySummary" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpDailySummary_no_truncate" BEFORE TRUNCATE ON "ErpDailySummary" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpFixedCostMonth" FROM extas_app;
CREATE TRIGGER "ErpFixedCostMonth_append_only" BEFORE UPDATE OR DELETE ON "ErpFixedCostMonth" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpFixedCostMonth_no_truncate" BEFORE TRUNCATE ON "ErpFixedCostMonth" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON "ErpBooksSend" FROM extas_app;
CREATE TRIGGER "ErpBooksSend_append_only" BEFORE UPDATE OR DELETE ON "ErpBooksSend" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "ErpBooksSend_no_truncate" BEFORE TRUNCATE ON "ErpBooksSend" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();

-- ErpEvent (PR 608): the event ledger keeps its processing state (status, attempts, result, error, appliedAt,
-- reversedBy) up to date, so it is not locked whole like the tables above. Its BODY is: what the ERP sent and where it
-- belongs (store, link, connection, eventId, type, source, money flag, dates, reverses, order, data, the body's hashes,
-- receivedAt) can never change, and no row can be removed, by any role. A repeat of the eventId with another body is
-- only counted on the row (conflictCount, conflictAt, conflictHash). The guard has its own function so the server's append-only
-- check (infra/deploy/app-role.sh, which counts the tables guarded by extas_append_only) is not confused by it.
CREATE OR REPLACE FUNCTION extas_erp_event_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'append-only: % on "%" is not allowed (PR 608)', TG_OP, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'An ERP event is kept forever: a correction is a new event that reverses it.';
  END IF;
  IF (NEW."storeId", NEW."linkId", NEW."integrationId", NEW."eventId", NEW."type", NEW."source", NEW."moneyEvent",
      NEW."occurredAt", NEW."businessDate", NEW."reverses", NEW."externalOrderId", NEW."data", NEW."bodyHash",
      NEW."rawBodyHash", NEW."receivedAt", NEW."createdAt")
     IS DISTINCT FROM
     (OLD."storeId", OLD."linkId", OLD."integrationId", OLD."eventId", OLD."type", OLD."source", OLD."moneyEvent",
      OLD."occurredAt", OLD."businessDate", OLD."reverses", OLD."externalOrderId", OLD."data", OLD."bodyHash",
      OLD."rawBodyHash", OLD."receivedAt", OLD."createdAt") THEN
    RAISE EXCEPTION 'append-only: the body of an ERP event never changes ("%", PR 608)', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Only the processing state of an event moves; a correction is a new event that reverses it.';
  END IF;
  RETURN NEW;
END $$;
REVOKE DELETE, TRUNCATE ON "ErpEvent" FROM extas_app;
CREATE TRIGGER "ErpEvent_body_fixed" BEFORE UPDATE OR DELETE ON "ErpEvent" FOR EACH ROW EXECUTE FUNCTION extas_erp_event_fixed();
CREATE TRIGGER "ErpEvent_no_truncate" BEFORE TRUNCATE ON "ErpEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_erp_event_fixed();

-- ErpStoreLink (PR 607, CN-029 §16): one ERP company, one open store link. "openErpCompanyId" is the company while the
-- link is open and null once it has ended; the app never writes it. Its unique index refuses a second store's open link
-- on the same company (the guard answers SHARED_COMPANY), while an ended link keeps its company for the record.
CREATE OR REPLACE FUNCTION extas_erp_link_open_company() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."openErpCompanyId" := CASE WHEN NEW."endedAt" IS NULL THEN NEW."erpCompanyId" ELSE NULL END;
  RETURN NEW;
END $$;
CREATE TRIGGER "ErpStoreLink_open_company" BEFORE INSERT OR UPDATE ON "ErpStoreLink" FOR EACH ROW EXECUTE FUNCTION extas_erp_link_open_company();
