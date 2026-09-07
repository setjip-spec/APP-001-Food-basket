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


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
