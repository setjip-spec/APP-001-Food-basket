const CONFIG = {
  SPREADSHEET_ID: '124tsSSYjG0Cax61MXlH1ZVuz4JfNt0Zjxx34BM4VRok',
  APP_TITLE: 'Продуктовая корзина',
  APP_VERSION: '1.0',
  WEEK_DAYS: 7,
  DEFAULT_LOW_STOCK_PERCENT: 20,
  SHEETS: {
    PRODUCTS: 'Продукты',
    STORES: 'Магазины',
    PRICES: 'Цены',
    BASKET: 'Корзина',
    CASHBACK: 'Кэшбэк',
    PURCHASES: 'Покупки',
    PURCHASE_ITEMS: 'Позиции покупок',
    SETTINGS: 'Настройки',
    REFERENCES: 'Справочники'
  }
};


const PRODUCT_FIELDS = [
  'productId','name','category','pack','weeklyTarget','daysSupply','homeStatus',
  'lastPurchase','forecastEnd','mainStore','price','active','note','currentStock','stockCheckedAt','almostEmpty'
];
const BASKET_FIELDS = [
  'basketItemId','productId','name','qty','storeId','storeName','unitPrice','sum',
  'source','status','addedAt','note','weeklyTarget','currentStock','recommendedQty'
];
let SETTINGS_CACHE_ = null;


function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


function getAppState() {
  const settings = getSettings_();
  const products = enrichProducts_(readProducts_(), settings);
  const stores = readStores_().filter(r => norm_(r.active) !== 'нет');
  const prices = readPrices_();
  const allBasket = readBasket_();
  const rawBasket = allBasket.filter(r => ['активно','собрано'].includes(norm_(r.status)));
  const cashback = [];
  const purchases = readPurchases_();
  const purchaseItems = readPurchaseItems_();
  const productMap = indexBy_(products, 'productId');
  const storeMap = indexBy_(stores, 'storeId');
  const enrichBasketRow = r => {
    const p = productMap[r.productId] || {};
    return Object.assign({}, r, { unit: normalizeUnit_(p.pack), category: p.category || '' });
  };
  const basket = rawBasket.map(enrichBasketRow);
  const activeProductIds = new Set(basket.map(r => r.productId).filter(Boolean));
  const removedByProduct = {};
  allBasket.forEach(r => {
    if (norm_(r.status) !== 'удалено' || !r.productId || activeProductIds.has(r.productId)) return;
    removedByProduct[r.productId] = r;
  });
  const basketRemoved = Object.keys(removedByProduct)
    .map(productId => enrichBasketRow(removedByProduct[productId]))
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  const storeSummaries = buildStoreSummaries_(basket, [], storeMap);
  const basketTotal = roundMoney_(basket.reduce((s, r) => s + num_(r.sum), 0));
  const expectedCashback = 0;
  const shortageItems = products.filter(p => num_(p.recommendedQty) > 0);


  return {
    app: { title: CONFIG.APP_TITLE, version: CONFIG.APP_VERSION },
    currentMonth: currentMonth_(),
    settings,
    categories: readCategories_(),
    units: ['шт.', 'кг'],
    products,
    stores,
    basketStoreId: settings.basketStoreId || '',
    prices,
    basket,
    basketRemoved,
    cashback,
    purchases,
    purchaseItems,
    nextShopping: nextShoppingWindow_(),
    summary: {
      ending: products.filter(p => norm_(p.homeStatus) === 'заканчивается').length,
      ended: products.filter(p => norm_(p.homeStatus) === 'закончилось').length,
      shortageProducts: shortageItems.length,
      recommendedUnits: roundMoney_(shortageItems.reduce((s, p) => s + num_(p.recommendedQty), 0)),
      basketItems: basket.length,
      basketTotal,
      expectedCashback,
      effectiveCost: roundMoney_(basketTotal - expectedCashback)
    },
    soon: shortageItems.sort((a, b) =>
      num_(b.recommendedQty) - num_(a.recommendedQty) ||
      String(a.name).localeCompare(String(b.name), 'ru')
    ),
    storeSummaries
  };
}


function saveSettings(payload) {
  payload = payload || {};
  const threshold = Math.min(100, Math.max(1, Math.round(num_(payload.lowStockPercent) || CONFIG.DEFAULT_LOW_STOCK_PERCENT)));
  upsertSetting_('low_stock_threshold_percent', threshold, 'Порог статуса «заканчивается» в процентах от недельной нормы');
  upsertSetting_('stock_show_unit', boolText_(payload.showUnit), 'Показывать колонку «Единица» на экране «Что дома»');
  upsertSetting_('stock_show_weekly_target', boolText_(payload.showWeeklyTarget), 'Показывать колонку «Норма / нед.» на экране «Что дома»');
  upsertSetting_('stock_show_remaining', boolText_(payload.showRemaining), 'Показывать колонку «Осталось» на экране «Что дома»');
  upsertSetting_('stock_show_to_buy', boolText_(payload.showToBuy), 'Показывать колонку «Докупить» на экране «Что дома»');
  upsertSetting_('stock_show_last_purchase', boolText_(payload.showLastPurchase), 'Показывать колонку «Последняя покупка» на экране «Что дома»');
  upsertSetting_('stock_show_status', boolText_(payload.showStatus), 'Показывать колонку «Статус» на экране «Что дома»');
  upsertSetting_('stock_group_mode', norm_(payload.groupMode) === 'category' ? 'category' : 'alphabet', 'Режим списка «Что дома»: category или alphabet');
  const allowedKgSteps = [0.1,0.2,0.3,0.4,0.5];
  const requestedKgStep = num_(payload.kgStep);
  const kgStep = allowedKgSteps.includes(requestedKgStep) ? requestedKgStep : 0.1;
  upsertSetting_('kg_quantity_step', kgStep, 'Шаг изменения количества для товаров в килограммах');
  SETTINGS_CACHE_ = null;
  recalcProductStatuses_();
  SETTINGS_CACHE_ = null;
  return getAppState();
}


function setBasketStore(storeId) {
  const stores = readStores_().filter(r => norm_(r.active) !== 'нет');
  const store = stores.find(s => s.storeId === storeId) || null;
  upsertSetting_('basket_store_id', store ? store.storeId : '', 'Магазин для текущей корзины');
  SETTINGS_CACHE_ = null;


  const basket = readBasket_().filter(r => ['активно','собрано'].includes(norm_(r.status)));
  const sheet = sheet_(CONFIG.SHEETS.BASKET);
  basket.forEach(item => {
    sheet.getRange(item._row, 5).setValue(store ? store.storeId : '');
    sheet.getRange(item._row, 6).setValue(store ? store.name : '');
  });
  return getAppState();
}


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


function addOrCreateBasketItem(payload) {
  payload = payload || {};
  const name = clean_(payload.name);
  if (!name) throw new Error('Введите название товара');
  let products = readProducts_();
  let product = products.find(p => norm_(p.name) === norm_(name));
  if (!product) {
    const unit = normalizeUnit_(payload.pack);
    const days = Math.max(0, num_(payload.daysSupply));
    const weeklyTarget = Math.max(minimumQty_(unit), quantizeQty_(payload.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(days)), unit));
    const productId = makeId_('PRD');
    const settings = getSettings_();
    const row = [
      productId, name, clean_(payload.category), unit,
      weeklyTarget, days || '', statusFromStock_(0, weeklyTarget, settings.lowStockPercent), '', '',
      '', num_(payload.price) || '', 'да', '', 0, new Date(), 'нет'
    ];
    sheet_(CONFIG.SHEETS.PRODUCTS).appendRow(row);
    products = readProducts_();
    product = products.find(p => p.productId === productId);
  } else if (payload.price !== '' && payload.price != null) {
    updateProductPrice_(product.productId, payload.price, getSettings_().basketStoreId || '');
    products = readProducts_();
    product = products.find(p => p.productId === product.productId);
  }
  const unit = normalizeUnit_(product.pack);
  const productStock = quantizeQty_(Math.max(0, num_(product.currentStock)), unit);
  const productAlmostEmpty = unit === 'шт.' && productStock > 0 && settingBool_(product.almostEmpty, false);
  const recommended = recommendedQty_(product.weeklyTarget, productAlmostEmpty ? Math.max(0, productStock - 1) : productStock, unit);
  const qty = payload.qty === '' || payload.qty == null
    ? Math.max(quantityStep_(unit), recommended || num_(product.weeklyTarget) || quantityStep_(unit))
    : quantizeQty_(Math.max(0, num_(payload.qty)), unit);
  upsertManualBasket_(product, qty, payload.price, getSettings_().basketStoreId || '');
  return getAppState();
}


function updateBasketItem(basketItemId, qty, price) {
  const rows = readBasket_();
  const item = rows.find(r => r.basketItemId === basketItemId);
  if (!item) throw new Error('Позиция кореины не найдена');
  const product = readProducts_().find(p => p.productId === item.productId) || {};
  const unit = normalizeUnit_(product.pack);
  const q = quantizeQty_(Math.max(0, num_(qty)), unit);
  const p = Math.max(0, num_(price));
  const settings = getSettings_();
  const stores = readStores_();
  const store = stores.find(s => s.storeId === settings.basketStoreId) || null;
  const sheet = sheet_(CONFIG.SHEETS.BASKET);
  sheet.getRange(item._row, 4).setValue(q);
  sheet.getRange(item._row, 5).setValue(store ? store.storeId : '');
  sheet.getRange(item._row, 6).setValue(store ? store.name : '');
  sheet.getRange(item._row, 7).setValue(p);
  sheet.getRange(item._row, 8).setValue(roundMoney_(q * p));
  if (item.productId) updateProductPrice_(item.productId, p, store ? store.storeId : '');
  return getAppState();
}


function setBasketCollected(basketItemId, value) {
  const rows = readBasket_();
  const item = rows.find(r => r.basketItemId === basketItemId);
  if (!item) throw new Error('Позиция корзины не найдена');
  const current = norm_(item.status);
  if (!['активно','собрано'].includes(current)) {
    throw new Error('Эту позицию уже нельзя отметить как собранную');
  }
  const next = settingBool_(value, false) ? 'собрано' : 'активно';
  sheet_(CONFIG.SHEETS.BASKET).getRange(item._row, 10).setValue(next);
  return true;
}


function removeBasketItem(basketItemId) {
  const rows = readBasket_();
  const item = rows.find(r => r.basketItemId === basketItemId);
  if (!item) return getAppState();
  sheet_(CONFIG.SHEETS.BASKET).getRange(item._row, 10).setValue('удалено');
  return getAppState();
}


function restoreBasketItem(basketItemId) {
  const rows = readBasket_();
  const item = rows.find(r => r.basketItemId === basketItemId);
  if (!item) throw new Error('Позиция корзины не найдена');
  if (norm_(item.status) !== 'удалено') return getAppState();
  const settings = getSettings_();
  const stores = readStores_();
  const store = stores.find(s => s.storeId === settings.basketStoreId) || null;
  const sheet = sheet_(CONFIG.SHEETS.BASKET);
  sheet.getRange(item._row, 5).setValue(store ? store.storeId : '');
  sheet.getRange(item._row, 6).setValue(store ? store.name : '');
  sheet.getRange(item._row, 9).setValue('вручную');
  sheet.getRange(item._row, 10).setValue('активно');
  return getAppState();
}


function addExistingProductToBasket(productId) {
  const product = readProducts_().find(p => p.productId === productId);
  if (!product) throw new Error('Продукт не найден');
  const rows = readBasket_();
  const current = rows.find(r => ['активно','собрано'].includes(norm_(r.status)) && r.productId === productId);
  if (current) return getAppState();
  const deleted = [...rows].reverse().find(r => norm_(r.status) === 'удалено' && r.productId === productId);
  if (deleted) return restoreBasketItem(deleted.basketItemId);
  const unit = normalizeUnit_(product.pack);
  const stock = quantizeQty_(Math.max(0, num_(product.currentStock)), unit);
  const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(product.almostEmpty, false);
  const effectiveStock = almostEmpty ? Math.max(0, stock - 1) : stock;
  const recommended = recommendedQty_(product.weeklyTarget, effectiveStock, unit);
  const qty = recommended > 0 ? recommended : quantityStep_(unit);
  upsertManualBasket_(product, qty, '', getSettings_().basketStoreId || '');
  return getAppState();
}


function saveBasketDraft(payload) {
  payload = payload || {};
  const incoming = Array.isArray(payload.items) ? payload.items : [];
  const stores = readStores_().filter(r => norm_(r.active) !== 'нет');
  const store = stores.find(s => s.storeId === clean_(payload.storeId)) || null;
  upsertSetting_('basket_store_id', store ? store.storeId : '', 'Магазин для текущей корзины');
  SETTINGS_CACHE_ = null;

  const products = readProducts_();
  const productMap = indexBy_(products, 'productId');
  const productSheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  const basketSheet = sheet_(CONFIG.SHEETS.BASKET);
  const basketRows = readBasket_();
  const byId = indexBy_(basketRows, 'basketItemId');
  const latestByProduct = {};
  basketRows.forEach(r => {
    if (!r.productId) return;
    if (!['активно','собрано','удалено'].includes(norm_(r.status))) return;
    latestByProduct[r.productId] = r;
  });

  const prices = readPrices_();
  const priceSheet = sheet_(CONFIG.SHEETS.PRICES);
  const priceByKey = {};
  prices.forEach(r => { if (r.productId && r.storeId) priceByKey[r.productId + '|' + r.storeId] = r; });

  incoming.forEach(raw => {
    const product = productMap[clean_(raw.productId)];
    if (!product) return;
    const unit = normalizeUnit_(product.pack);
    const qty = quantizeQty_(Math.max(0, num_(raw.qty)), unit);
    const price = Math.max(0, num_(raw.price));
    const statusRaw = norm_(raw.status);
    const status = ['активно','собрано','удалено'].includes(statusRaw) ? statusRaw : 'активно';
    let existing = byId[clean_(raw.basketItemId)] || latestByProduct[product.productId] || null;
    const id = existing ? existing.basketItemId : makeId_('BKT');
    const target = Math.max(
      minimumQty_(unit),
      quantizeQty_(product.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(product.daysSupply)), unit)
    );
    const stock = quantizeQty_(Math.max(0, num_(product.currentStock)), unit);
    const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(product.almostEmpty, false);
    const effectiveStock = almostEmpty ? Math.max(0, stock - 1) : stock;
    const recommended = recommendedQty_(target, effectiveStock, unit);
    const source = clean_(raw.source || (existing && existing.source)) || 'вручную';
    const addedAt = parseDate_(existing && existing.addedAt) || new Date();
    const note = clean_(existing && existing.note);
    const row = [
      id,
      product.productId,
      product.name,
      qty,
      store ? store.storeId : '',
      store ? store.name : '',
      price || '',
      roundMoney_(qty * price),
      source,
      status,
      addedAt,
      note,
      target,
      stock,
      recommended
    ];
    if (existing) {
      basketSheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
    } else {
      basketSheet.appendRow(row);
      existing = Object.assign({ _row: basketSheet.getLastRow() }, {
        basketItemId: id, productId: product.productId, status
      });
      byId[id] = existing;
    }
    latestByProduct[product.productId] = existing;
    if (status !== 'удалено') {
      productSheet.getRange(product._row, 11).setValue(price || '');
      if (store) {
        const key = product.productId + '|' + store.storeId;
        const oldPrice = priceByKey[key] || null;
        const priceRow = [
          oldPrice ? oldPrice.priceId : makeId_('PRC'),
          product.productId,
          store.storeId,
          price || '',
          new Date(),
          oldPrice ? oldPrice.main : '',
          oldPrice ? oldPrice.note : ''
        ];
        if (oldPrice) {
          priceSheet.getRange(oldPrice._row, 1, 1, priceRow.length).setValues([priceRow]);
        } else {
          priceSheet.appendRow(priceRow);
          priceByKey[key] = {
            _row: priceSheet.getLastRow(),
            priceId: priceRow[0],
            productId: product.productId,
            storeId: store.storeId,
            main: '',
            note: ''
          };
        }
      }
    }
  });

  return getAppState();
}


function completePurchase(actualsByStore, manualCashbackParams) {
  actualsByStore = actualsByStore || {};
  manualCashbackParams = manualCashbackParams || {};
  const basket = readBasket_().filter(r => ['активно','собрано'].includes(norm_(r.status)) && num_(r.qty) > 0);
  if (!basket.length) throw new Error('Корзина пуста');
  const stores = readStores_();
  const storeMap = indexBy_(stores, 'storeId');
  const grouped = groupBy_(basket, r => r.storeId || 'NO_STORE');
  const purchaseRows = [];
  const itemRows = [];
  const today = new Date();
  const cashbackPct = Math.min(100, Math.max(0, num_(manualCashbackParams.percent)));
  const cashbackLimit = Math.max(0, num_(manualCashbackParams.limit));
  Object.keys(grouped).forEach(storeId => {
    const items = grouped[storeId];
    const store = storeMap[storeId] || { storeId, name: items[0] ? items[0].storeName : 'Без магазина' };
    const planned = roundMoney_(items.reduce((s, r) => s + num_(r.sum), 0));
    const expected = calcManualCashback_(planned, cashbackPct, cashbackLimit);
    const override = actualsByStore[storeId] || {};
    const actual = override.actualTotal === '' || override.actualTotal == null ? planned : num_(override.actualTotal);
    const discount = num_(override.discount);
    const actualCashback = calcManualCashback_(Math.max(0, actual - discount), cashbackPct, cashbackLimit);
    const net = roundMoney_(actual - actualCashback);
    const purchaseId = makeId_('BUY');
    const cashbackComment = 'Кэшбэк ' + cashbackPct + '%; лимит ' + (cashbackLimit || 0) + 'рублей. ';
    purchaseRows.push([
      purchaseId, today, currentMonth_(),
      storeId === 'NO_STORE' ? '' : storeId,
      store.name || '',
      planned, actual, discount || '', expected || '', actualCashback, net,
      cashbackComment + clean_(override.comment)
    ]);
    items.forEach(item => {
      itemRows.push([
        makeId_('ITM'), purchaseId, item.productId, item.name,
        num_(item.qty) || 1, num_(item.unitPrice) || '', num_(item.sum) || ''
      ]);
    });
  });
  if (purchaseRows.length) appendRows_(sheet_(CONFIG.SHEETS.PURCHASES), purchaseRows);
  if (itemRows.length) appendRows_(sheet_(CONFIG.SHEETS.PURCHASE_ITEMS), itemRows);
  const products = readProducts_();
  const productMap = indexBy_(products, 'productId');
  const boughtByProduct = {};
  basket.forEach(item => {
    boughtByProduct[item.productId] = num_(boughtByProduct[item.productId]) + num_(item.qty);
  });
  const productSheet = sheet_(CONFIG.SHEETS.PRODUCTS);
  const basketSheet = sheet_(CONFIG.SHEETS.BASKET);
  const settings = getSettings_();
  basket.forEach(item => basketSheet.getRange(item._row, 10).setValue('куплено'));
  readBasket_().filter(r => norm_(r.status) === 'удалено').forEach(item => basketSheet.getRange(item._row, 10).setValue('архив'));
  Object.keys(boughtByProduct).forEach(productId => {
    const p = productMap[productId];
    if (!p) return;
    const unit = normalizeUnit_(p.pack);
    const newStock = quantizeQty_(num_(p.currentStock) + num_(boughtByProduct[productId]), unit);
    const target = Math.max(minimumQty_(unit), quantizeQty_(p.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(p.daysSupply)), unit));
    const forecast = num_(p.daysSupply) > 0 && newStock > 0 ? addDays_(today, num_(p.daysSupply) * newStock) : '';
    productSheet.getRange(p._row, 7).setValue(statusFromStock_(newStock, target, settings.lowStockPercent, false));
    productSheet.getRange(p._row, 8).setValue(today);
    productSheet.getRange(p._row, 9).setValue(forecast || '');
    productSheet.getRange(p._row, 14).setValue(newStock);
    productSheet.getRange(p._row, 15).setValue(today);
    productSheet.getRange(p._row, 16).setValue('нет');
  });
  return getAppState();
}


function syncAutomaticBasket_(options) {
  options = options || {};
  const reviveDeleted = !!options.reviveDeleted;
  const products = readProducts_();
  const basket = readBasket_();
  const basketSheet = sheet_(CONFIG.SHEETS.BASKET);
  const settings = getSettings_();
  const stores = readStores_();
  const selectedStore = stores.find(s => s.storeId === settings.basketStoreId) || null;
  products.forEach(product => {
    const unit = normalizeUnit_(product.pack);
    const target = Math.max(minimumQty_(unit), quantizeQty_(product.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(product.daysSupply)), unit));
    const stock = quantizeQty_(Math.max(0, num_(product.currentStock)), unit);
    const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(product.almostEmpty, false);
    const effectiveStock = almostEmpty ? Math.max(0, stock - 1) : stock;
    const recommended = recommendedQty_(target, effectiveStock, unit);
    const existing = basket.find(r => ['активно','собрано'].includes(norm_(r.status)) && r.productId === product.productId);
    const deleted = [...basket].reverse().find(r => norm_(r.status) === 'удалено' && r.productId === product.productId);
    if (existing) {
      basketSheet.getRange(existing._row, 5).setValue(selectedStore ? selectedStore.storeId : '');
      basketSheet.getRange(existing._row, 6).setValue(selectedStore ? selectedStore.name : '');
      basketSheet.getRange(existing._row, 13).setValue(target);
      basketSheet.getRange(existing._row, 14).setValue(stock);
      basketSheet.getRange(existing._row, 15).setValue(recommended);
      if (norm_(existing.status) === 'активно' && norm_(existing.source) === 'авто') {
        if (recommended <= 0) {
          basketSheet.getRange(existing._row, 10).setValue('удалено');
        } else {
          const price = num_(existing.unitPrice) || num_(product.price);
          basketSheet.getRange(existing._row, 4).setValue(recommended);
          basketSheet.getRange(existing._row, 7).setValue(price || '');
          basketSheet.getRange(existing._row, 8).setValue(roundMoney_(recommended * price));
        }
      }
      return;
    }
    if (recommended <= 0) return;
    if (deleted) {
      if (!reviveDeleted) return;
      const price = num_(deleted.unitPrice) || num_(product.price);
      basketSheet.getRange(deleted._row, 4).setValue(recommended);
      basketSheet.getRange(deleted._row, 5).setValue(selectedStore ? selectedStore.storeId : '');
      basketSheet.getRange(deleted._row, 6).setValue(selectedStore ? selectedStore.name : '');
      basketSheet.getRange(deleted._row, 7).setValue(price || '');
      basketSheet.getRange(deleted._row, 8).setValue(roundMoney_(recommended * price));
      basketSheet.getRange(deleted._row, 9).setValue('авто');
      basketSheet.getRange(deleted._row, 10).setValue('активно');
      basketSheet.getRange(deleted._row, 13).setValue(target);
      basketSheet.getRange(deleted._row, 14).setValue(stock);
      basketSheet.getRange(deleted._row, 15).setValue(recommended);
      return;
    }
    const price = num_(product.price);
    basketSheet.appendRow([
      makeId_('BKT'), product.productId, product.name, recommended,
      selectedStore ? selectedStore.storeId : '', selectedStore ? selectedStore.name : '', price || '', roundMoney_(recommended * price),
     'авто', 'активно', new Date(), '',
     target, stock, recommended
    ]);
  });
}


function upsertManualBasket_(product, qty, priceOverride, storeId) {
  const rows = readBasket_();
  const sheet = sheet_(CONFIG.SHEETS.BASKET);
  const existing = rows.find(r => ['активно','собрано'].includes(norm_(r.status)) && r.productId === product.productId);
  const deleted = [...rows].reverse().find(r => norm_(r.status) === 'удалено' && r.productId === product.productId);
  const stores = readStores_();
  const selectedId = getSettings_().basketStoreId || storeId || '';
  const store = stores.find(s => s.storeId === selectedId) || null;
  const price = priceOverride === '' || priceOverride == null ? num_(product.price) : num_(priceOverride);
  const unit = normalizeUnit_(product.pack);
  const target = Math.max(minimumQty_(unit), quantizeQty_(product.weeklyTarget || (unit === 'кг' ? 1 : calcWeeklyTarget_(product.daysSupply)), unit));
  const stock = quantizeQty_(Math.max(0, num_(product.currentStock)), unit);
  const almostEmpty = unit === 'шт.' && stock > 0 && settingBool_(product.almostEmpty, false);
  const effectiveStock = almostEmpty ? Math.max(0, stock - 1) : stock;
  const recommended = recommendedQty_(target, effectiveStock, unit);
  qty = quantizeQty_(qty, unit);
  if (existing) {
    const newQty = quantizeQty_(num_(existing.qty) + qty, unit);
    sheet.getRange(existing._row, 4).setValue(newQty);
    if (store) {
      sheet.getRange(existing._row, 5).setValue(store.storeId);
      sheet.getRange(existing._row, 6).setValue(store.name);
    }
    sheet.getRange(existing._row, 7).setValue(price || '');
    sheet.getRange(existing._row, 8).setValue(roundMoney_(newQty * price));
    sheet.getRange(existing._row, 9).setValue('вручную');
    if (norm_(existing.status) === 'собрано') sheet.getRange(existing._row, 10).setValue('активно');
    sheet.getRange(existing._row, 13).setValue(target);
    sheet.getRange(existing._row, 14).setValue(stock);
    sheet.getRange(existing._row, 15).setValue(recommended);
    return;
  }
  if (deleted) {
    sheet.getRange(deleted._row, 4).setValue(qty);
    sheet.getRange(deleted._row, 5).setValue(store ? store.storeId : '');
    sheet.getRange(deleted._row, 6).setValue(store ? store.name : '');
    sheet.getRange(deleted._row, 7).setValue(price || '');
    sheet.getRange(deleted._row, 8).setValue(roundMoney_(qty * price));
    sheet.getRange(deleted._row, 9).setValue('вручную');
    sheet.getRange(deleted._row, 10).setValue('активно');
    sheet.getRange(deleted._row, 13).setValue(target);
    sheet.getRange(deleted._row, 14).setValue(stock);
    sheet.getRange(deleted._row, 15).setValue(recommended);
    return;
  }
  sheet.appendRow([
    makeId_('BKT'), product.productId, product.name, qty,
    store ? store.storeId : '', store ? store.name : '', price || '', roundMoney_(qty * price),
    'вручную', 'активно', new Date(), '',
    target, stock, recommended
  ]);
}


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
  return rowsToObjects_(sheet_(CONFIG.SHEEQUS.BASKET), BASKET_FIELDS);
}


function readCashback_() {
  return [];
}


function readPurchases_() {
  return rowsToObjects_(sheet_(CONFIG.SHEETS.PURCHASES));
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
    basketCashbackPercent: 0,
    basketCashbackLimit: 0,
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


function buildStoreSummaries_(basket, cashbackRules, storeMap) {
  const grouped = groupBy_(basket, r => r.storeId || 'NO_STORE');
  return Object.keys(grouped).map(storeId => {
    const items = grouped[storeId];
    const store = storeMap[storeId] || { storeId, name: items[0] ? items[0].storeName : 'Без магазина' };
    const total = roundMoney_(items.reduce((s, r) => s + num_(r.sum), 0));
    const cashback = calcCashbackForStore_(store.name, total, cashbackRules);
    return {
      storeId: storeId === 'NO_STORE' ? '' : storeId,
      name: store.name || 'Без магазина',
      itemCount: items.length,
      total,
      cashback,
      effective: roundMoney_(total - cashback)
    };
  }).sort((a,b) => b.total - a.total);
}


function calcManualCashback_(amount, percent, limit) {
  const total = Math.max(0, num_(amount));
  const pct = Math.min(100, Math.max(0, num_(percent)));
  const cap = Math.max(0, num_(limit));
  const value = total * pct / 100;
  return roundMoney_(cap > 0 ? Math.min(value, cap) : value);
}


function calcCashbackForStore_(storeName, amount, rules) {
  const month = norm_(currentMonth_());
  const target = norm_(storeName);
  const candidates = rules.filter(r => {
    const ruleMonth = norm_(r.month);
    if (ruleMonth && ruleMonth !== month) return false;
    const t = norm_(r.target);
    return !t || t === target || t === 'все' || t === 'супермаркеты' || t === 'продукты';
  });
  if (!candidates.length) return 0;
  const best = candidates.sort((a,b) => num_(b.percent) - num_(a.percent))[0];
  let pct = num_(best.percent);
  if (pct > 1) pct = pct / 100;
  const limit = num_(best.limit);
  const already = num_(best.already);
  const remaining = limit ? Math.max(0, limit - already) : Infinity;
  return roundMoney_(Math.min(amount * pct, remaining));
}


function rowsToObjects_(sheet, fields) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const width = fields.length;
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  return values.map((row, i) => {
    const obj = { _row: i + 2 };
    fields.forEach((f, idx) => obj[f] = serializeValue_(row[idx]));
    return obj;
  }).filter(obj => fields.some(f => obj[f] !== '' && obj[f] != null));
}


function serializeValue_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}


function upsertById_(sheet, rows, id, row, idField) {
  const existing = rows.find(r => r[idField] === id);
  if (existing) sheet.getRange(existing._row, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
}


function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}


function sheet_(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Не найден лист: ' + name);
  return sheet;
}


function indexBy_(arr, key) {
  const out = {};
  arr.forEach(x => { if (x[key]) out[x[key]] = x; });
  return out;
}


function groupBy_(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});
}


function calcWeeklyTarget_(daysSupply) {
  const days = num_(daysSupply);
  return days > 0 ? Math.max(1, Math.ceil(CONFIG.WEEK_DAYS / days)) : 1;
}


function statusFromStock_(stock, target, thresholdPercent, almostEmpty) {
  const s = num_(stock);
  const t = Math.max(0, num_(target));
  if (s <= 0) return 'закончилось';
  if (almostEmpty === true || norm_(almostEmpty) === 'да' || norm_(almostEmpty) === 'true') return 'заканчивается';
  if (t <= 0) return 'есть достаточно';
  const percent = (s / t) * 100;
  if (percent < Math.max(1, num_(thresholdPercent))) return 'заканчивается';
  return 'есть достаточно';
}


function recommendedQty_(target, stock, unit) {
  const missing = Math.max(0, num_(target) - num_(stock));
  return ceilQty_(missing, unit);
}


function normalizeUnit_(value) {
  const v = norm_(value);
  return v.includes('кл') || v === 'kg' ? 'кл' : 'шт.';
}


function minimumQty_(unit) {
  return normalizeUnit_(unit) === 'кг' ? 0.1 : 1;
}


function quantityStep_(unit) {
  return normalizeUnit_(unit) === 'кг' ? getSettings_().kgStep : 1;
}


function quantizeQty_(value, unit) {
  const v = Math.max(0, num_(value));
  if (normalizeUnit_(unit) !== 'кл') return Math.round(v);
  return roundQty_(Math.round((v + Number.EPSILON) * 10) / 10);
}


function ceilQty_(value, unit) {
  const step = quantityStep_(unit);
  const v = Math.max(0, num_(value));
  if (v <= 0) return 0;
  if (step === 1) return Math.ceil(v);
  return roundQty_(Math.ceil((v - 1e-9) / step) * step);
}


function roundQty_(value) {
  return Math.round((num_(value) + Number.EPSILON) * 1000) / 1000;
}


function nextShoppingWindow_() {
  const now = new Date();
  const day = now.getDay();
  let deltaToSat;
  if (day === 6) deltaToSat = 0;
  else if (day === 0) deltaToSat = 6;
  else deltaToSat = 6 - day;
  const sat = addDays_(new Date(now.getFullYear(), now.getMonth(), now.getDate()), deltaToSat);
  const sun = addDays_(sat, 1);
  return {
    start: Utilities.formatDate(sat, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    end: Utilities.formatDate(sun, Session.getScriptTimeZone(), 'yyyy-MM-dd')
  };
}


function daysSince_(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return null;
  const now = new Date();
  const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return Math.max(0, diff);
}


function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}


function currentMonth_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
}


function addDays_(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
}


function parseDate_(value) {
  if (!value) return '';
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d) ? '' : d;
}


function dateValue_(v) {
  if (!v) return 0;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? 0 : d.getTime();
}


function norm_(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}


function clean_(v) {
  return String(v == null ? '' : v).trim();
}


function num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}


function roundMoney_(v) {
  return Math.round((num_(v) + Number.EPSILON) * 100) / 100;
}


function settingBool_(value, defaultValue) {
  if (value === '' || value == null) return defaultValue;
  const v = norm_(value);
  return v === 'да' || v === 'true' || v === '1' || v === 'yes';
}


function boolText_(value) {
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on' || value === 'да' ? 'да' : 'нет';
}