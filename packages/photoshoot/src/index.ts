// @extas/photoshoot — S24 · Virtual Photoshoot Studio (PR 444–480, 539; Blueprint C7). Model library and generation
// pipeline sitting behind the owner's settings and the `photoshoot.*` permissions; every provider runs on its mock
// until the owner enters a real key and its Test passes (A1.3); an image never publishes without a human approval
// (C7.6, mandatory permanently); nothing here ever touches price, stock, an order or customer data (C7.20).
export * from './context';
export * from './roles';
export * from './assets';
export * from './models';
export * from './ghostMannequin';
export * from './garmentPrep';
export * from './referenceAnalysis';
export * from './jobs';
export * from './spendCap';
export * from './outputs';
export * from './detailRegions';
export * from './footwearStudio';
export * from './wornAccessoryStudio';
export * from './finishing';
export * from './imageEdits';
export * from './pilotMetrics';
export * from './styleAbTest';
