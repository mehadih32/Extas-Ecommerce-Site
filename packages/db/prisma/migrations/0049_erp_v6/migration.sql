-- PR 607–610 (CN-028): Retail and the ERP supplier model (docs/RETAIL-ERP-MODEL.md, docs/erp/site-changes-v6.md).
-- Everything here is behind the setting `erp.model` (v5 until the ERP's switch date): in v5 nothing reads or writes it.
-- Everything is added; nothing is dropped, renamed or removed.

-- PR 607: a v5 call that v6 retired on the switch date is kept as a RETIRED row, never sent.
-- AlterEnum
ALTER TYPE "ErpPushStatus" ADD VALUE 'RETIRED';
