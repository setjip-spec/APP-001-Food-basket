function saveProduct(payload) {
  payload = payload || {};
  const sheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  const rows = readProducts_();
  const existing = payload.productId ? rows.find(r => r.productId === payload.productId) : null;
  const id = payload.productId || makeId_('PRD');
  const unit = normalizeUnit_(payload.pack != null && payload.pack !== '' ? payload.pack : (existing && existing.pack));
  const days = payload.daysSupply === '' || payload.daysSupply == null
    ? num_(existing && existing.daysSupply)
    : Math.max(0, num_(payload.daysSupply));
  const fallbackTarget = existing ? num_(existing.weeklyTarget) : (unit === 'кг' ? 1 : calcWeeklyTarget_(days));
  const weeklyTarget = Math.max(minimumQty_(unit), quantizeQty_(payload.weeklyTarget === '' || payload.weeklyTarget == null ? fallbackTarget : payload.weeklyTarget, unit));
  const currentStock = payload.currentStock === '' || payload.currentStock == null
    ? quantizeQty_(existing && existing.currentStock, unit)
    : quantizeQty_(Math.max(0, num_(payload.currentStock)), unit);
  const almostEmpty = unit === 'шт.' && currentStock > 0 && settingBool_(
    payload.almostEmpty === '' || payload.almostEmpty == null ? (existing && existing.almostEmpty) : payload.almostEmpty,
    false
  );
  const lastPurchase = parseDate_(payload.lastPurchase || (existing && existing.lastPurchase));
  const forecast = lastPurchase && days > 0 && currentStock > 0
    ? addDays_(lastPurchase, days * currentStock)
    : (existing && existing.forecastEnd) || '';
  const settings = getSettings_();
  const status = statusFromStock_(currentStock, weeklyTarget, settings.lowStockPercent, almostEmpty);


  const row = [
    id,
    clean_(payload.name || (existing && existing.name)),
    clean_(payload.category != null ? payload.category : (existing && existing.category)),
    unit,
    weeklyTarget,
    days || '',
    status,
    lastPurchase || '',
    forecast || '',
    clean_(payload.mainStore != null ? payload.mainStore : (existing && existing.mainStore)),
    payload.price === '' || payload.price == null ? num_(existing && existing.price) || '' : num_(payload.price),
    clean_(payload.active || (existing && existing.active)) || 'да',
    clean_(payload.note != null ? payload.note : (existing && existing.note)),
    currentStock,
    parseDate_(payload.stockCheckedAt || (existing && existing.stockCheckedAt)) || '',
    almostEmpty ? 'да' : 'нет'
  ];


  upsertById_(sheet, rows, id, row, 'productId');
  syncAutomaticBasket_();
  return getAppState();
}


function saveStore(payload) {
  payload = payload || {};
  const sheet = sheet_(CONFIG.SHEETS.STORES);
  const rows = readStores_();
  const id = payload.storeId || makeId_('STR');
  const existing = rows.find(r => r.storeId === id);
  const row = [
    id,
    clean_(payload.name || (existing && existing.name)),
    clean_(payload.type || (existing && existing.type)),
    clean_(payload.active || (existing && existing.active)) || 'да',
    clean_(payload.note || (existing && existing.note))
  ];
  upsertById_(sheet, rows, id, row, 'storeId');
  return getAppState();
}


function saveCashback(payload) {
  payload = payload || {};
  const sheet = sheet_(CONFIG.SHEETS.CASHBACK);
  const rows = readCashback_();
  const id = payload.cashbackId || makeId_('CB');
  const limit = num_(payload.limit);
  const already = num_(payload.already);
  const available = Math.max(0, limit - already);
  const row = [
    id,
    clean_(payload.month) || currentMonth_(),
    clean_(payload.bank),
    clean_(payload.target),
    num_(payload.percent) || '',
    limit || '',
    already || '',
    available || '',
    clean_(payload.active) || 'да',
    clean_(payload.note)
  ];
  upsertById_(sheet, rows, id, row, 'cashbackId');
  return getAppState();
}


function buildBasketFromInventory(items) {
  items = Array.isArray(items) ? items : [];
  const products = readProducts_();
  const productMap = indexBy_(products, 'productId');
  const productSheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  const settings = getSettings_();
  const now = new Date();


  items.forEach(item => {
    const p = productMap[item.productId];
    if (!p) return;
    const unit = normalizeUnit_(p.pack);
    const stock = quantizeQty_(Math.max(0, num_(item.currentStock)), unit);
    const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(item.almostEmpty, false);
    const target = Math.max(minimumQty_(unit), quantizeQty_(p.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(p.daysSupply)), unit));
    const status = statusFromStock_(stock, target, settings.lowStockPercent, almostEmpty);
    productSheet.getRange(p._row, 5).setValue(target);
    productSheet.getRange(p._row, 7).setValue(status);
    productSheet.getRange(p._row, 14).setValue(stock);
    productSheet.getRange(p._row, 15).setValue(now);
    productSheet.getRange(p._row, 16).setValue(almostEmpty ? 'да' : 'нет');
  });


  syncAutomaticBasket_({ reviveDeleted: true });
  return getAppState();
}
