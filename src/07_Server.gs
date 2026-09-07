function updateProductPrice_(productId, price, storeId) {
  const p = readProducts_().find(x => x.productId === productId);
  if (!p) return;
  const value = Math.max(0, num_(price));
  sheet_(CONFIG.SHEETS.PRODUCTS).getRange(p._row, 11).setValue(value);

  if (storeId) {
    const prices = readPrices_();
    const existing = prices.find(r => r.productId === productId && r.storeId === storeId);
    const priceSheet = sheet_(CONFIG.SHEETS.PRICES);
    const row = [
      existing ? existing.priceId : makeId_('PRC'),
      productId, storeId, value, new Date(),
      existing ? existing.main : '', existing ? existing.note : ''
    ];
    if (existing) priceSheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
    else priceSheet.appendRow(row);
  }
}

function enrichProducts_(products, settings) {
  return products.map(p => {
    const unit = normalizeUnit_(p.pack);
    const target = Math.max(minimumQty_(unit), quantizeQty_(p.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(p.daysSupply)), unit));
    const stock = quantizeQty_(Math.max(0, num_(p.currentStock)), unit);
    const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(p.almostEmpty, false);
    const effectiveStock = almostEmpty ? Math.max(0, stock - 1) : stock;
    return Object.assign({}, p, {
      unit,
      weeklyTarget: target,
      currentStock: stock,
      effectiveStock,
      almostEmpty,
      recommendedQty: recommendedQty_(target, effectiveStock, unit),
      homeStatus: statusFromStock_(stock, target, settings.lowStockPercent, almostEmpty),
      daysSincePurchase: daysSince_(p.lastPurchase)
    });
  });
}

function recalcProductStatuses_() {
  const products = readProducts_();
  const sheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  const settings = getSettings_();
  products.forEach(p => {
    const unit = normalizeUnit_(p.pack);
    const target = Math.max(minimumQty_(unit), quantizeQty_(p.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(p.daysSupply)), unit));
    const stock = quantizeQty_(p.currentStock, unit);
    const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(p.almostEmpty, false);
    sheet.getRange(p._row, 7).setValue(statusFromStock_(stock, target, settings.lowStockPercent, almostEmpty));
  });
}

function setAlmostEmpty(productId, value) {
  const products = readProducts_();
  const p = products.find(x => x.productId === productId);
  if (!p) throw new Error('Продукт не найден');
  const unit = normalizeUnit_(p.pack);
  const stock = quantizeQty_(Math.max(0, num_(p.currentStock)), unit);
  const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(value, false);
  const target = Math.max(minimumQty_(unit), quantizeQty_(p.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(p.daysSupply)), unit));
  const settings = getSettings_();
  const sheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  sheet.getRange(p._row, 16).setValue(almostEmpty ? 'да' : 'нет');
  sheet.getRange(p._row, 7).setValue(statusFromStock_(stock, target, settings.lowStockPercent, almostEmpty));
  syncAutomaticBasket_();
  return getAppState();
}

function readProducts_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.PRODUCTS), PRODUCT_FIELDS)
    .filter(r => norm_(r.active) !== 'нет');
}

function readStores_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.STORES), ['storeId','name','type','active','note']);
}

function readPrices_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.PRICES), ['priceId','productId','storeId','price','updatedAt','main','note']);
}

function readBasket_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.BASKET), BASKET_FIELDS);
}

function readCashback_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.CASHBACK), ['cashbackId','month','bank','target','percent','limit','already','available','active','note']);
}

function readPurchases_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.PURCHASES), ['purchaseId','date','month','storeId','storeName','plannedTotal','actualTotal','discount','expectedCashback','actualCashback','netSpend','comment'])
    .sort((a,b) => dateValue_(b.date) - dateValue_(a.date));
}

function readPurchaseItems_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.PURCHASE_ITEMS), ['purchaseItemId','purchaseId','productId','name','qty','unitPrice','sum']);
}

function readCategories_() {
  const sheet = sheet_(CONFIG.SHEETS.REFERENCES);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(clean_).filter(Boolean);
}

function getSettings_() {
  if (SETTINGS_CACHE_) return SETTINGS_CACHE_;
  const raw = readSettingsMap_();
  const allowedKgSteps = [0.1,0.2,0.3,0.4,0.5];
  const rawKgStep = num_(raw.kg_quantity_step);
  SETTINGS_CACHE_ = {
    lowStockPercent: Math.min(100, Math.max(1, Math.round(num_(raw.low_stock_threshold_percent) || CONFIG.DEFAULT_LOW_STOCK_PERCENT))),
    kgStep: allowedKgSteps.includes(rawKgStep) ? rawKgStep : 0.1,
    basketStoreId: clean_(raw.basket_store_id),
    stockColumns: {
      unit: settingBool_(raw.stock_show_unit, true),
      weeklyTarget: settingBool_(raw.stock_show_weekly_target, false),
      remaining: settingBool_(raw.stock_show_remaining, true),
      toBuy: settingBool_(raw.stock_show_to_buy, true),
      lastPurchase: settingBool_(raw.stock_show_last_purchase, true),
      status: settingBool_(raw.stock_show_status, true)
    },
    stockGroupMode: norm_(raw.stock_group_mode) === 'category' || norm_(raw.stock_group_mode) === 'категории' ? 'category' : 'alphabet'
  };
  return SETTINGS_CACHE_;
}

function readSettingsMap_() {
  const rows = rowsToObjects_(sheet_(CONFIG.SHEETS.SETTINGS), ['key','value','description']);
  const out = {};
  rows.forEach(r => { if (r.key) out[r.key] = r.value; });
  return out;
}

function upsertSetting_(key, value, description) {
  const sheet = sheet_(CONFIG.SHEETS.SETTINGS);
  const lastRow = sheet.getLastRow();
  const values = lastRow >= 2 ? sheet.getRange(2,1,lastRow-1,3).getValues() : [];
  const idx = values.findIndex(r => String(r[0]) === key);
  const row = [key, value, description || ''];
  if (idx >= 0) sheet.getRange(idx + 2, 1, 1, 3).setValues([row]);
  else sheet.appendRow(row);
  SETTINGS_CACHE_ = null;
}
