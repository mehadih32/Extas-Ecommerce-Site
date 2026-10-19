// The installation export (PR 509) is an allow-list: it reads the settings values, the stores' technical columns and
// the structure tables below, and nothing else — never a customer, an order, a payment, a message, a log, a key or a
// file. `'*'` = the export may read every column the pack form has; a list = only those columns. The owner-data check
// fails CI if a register table or column ever lands here.
export const EXPORT_READS: Readonly<Record<string, '*' | readonly string[]>> = {
  InstallationSettingValue: ['key', 'value'],
  StoreSettingValue: ['storeId', 'key', 'value'],
  Store: ['id', 'isPrimary', 'defaultLocale', 'currency', 'timezone'],
  GarmentType: '*',
  Category: '*',
  DeliveryBand: ['key', 'nameEn', 'nameBn', 'hoursMin', 'hoursMax', 'mode', 'sortOrder'],
  NotificationTemplate: '*',
};

export const EXPORT_TABLES: readonly string[] = Object.keys(EXPORT_READS);
