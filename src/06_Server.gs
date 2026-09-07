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
