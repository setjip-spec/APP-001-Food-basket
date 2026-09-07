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
  if (!item) throw new Error('Позиция корзины не найдена');


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
