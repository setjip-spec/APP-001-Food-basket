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
