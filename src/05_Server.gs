function completePurchase(payload) {
  payload = payload || {};
  const draft = payload.draft || null;
  if (draft) saveBasketDraft(draft);


  const actualsByStore = payload.actualsByStore || {};
  const cashbackPercent = Math.min(100, Math.max(0, num_(payload.cashbackPercent)));
  const cashbackLimit = Math.max(0, num_(payload.cashbackLimit));
  const basket = readBasket_().filter(r => ['активно','собрано'].includes(norm_(r.status)) && num_(r.qty) > 0);
  if (!basket.length) throw new Error('Корзина пуста');


  const stores = readStores_();
  const storeMap = indexBy_(stores, 'storeId');
  const grouped = groupBy_(basket, r => r.storeId || 'NO_STORE');
  const storeIds = Object.keys(grouped);
  const totalPlanned = roundMoney_(basket.reduce((s, r) => s + num_(r.sum), 0));
  const totalExpectedCashback = calcManualCashback_(totalPlanned, cashbackPercent, cashbackLimit);
  const purchaseRows = [];
  const itemRows = [];
  const today = new Date();


  storeIds.forEach((storeId, groupIndex) => {
    const items = grouped[storeId];
    const store = storeMap[storeId] || { storeId, name: items[0] ? items[0].storeName : 'Без магазина' };
    const planned = roundMoney_(items.reduce((s, r) => s + num_(r.sum), 0));
    const expected = groupIndex === 0 ? totalExpectedCashback : 0;
    const override = actualsByStore[storeId] || {};
    const actual = override.actualTotal === '' || override.actualTotal == null ? planned : num_(override.actualTotal);
    const discount = num_(override.discount);
    const actualCashback = override.actualCashback === '' || override.actualCashback == null
      ? calcManualCashback_(actual, cashbackPercent, cashbackLimit)
      : Math.max(0, num_(override.actualCashback));
    const effectiveCashback = actualCashback;
    const net = roundMoney_(actual - effectiveCashback);
    const purchaseId = makeId_('BUY');
    const cashbackNote = cashbackPercent > 0
      ? 'Кэшбэк ' + cashbackPercent + '% · ' + (cashbackLimit > 0 ? 'лимит ' + roundMoney_(cashbackLimit) + ' ₽' : 'без лимита')
      : '';
    const userComment = clean_(override.comment);
    const comment = [cashbackNote, userComment].filter(Boolean).join(' · ');


    purchaseRows.push([
      purchaseId, today, currentMonth_(),
      storeId === 'NO_STORE' ? '' : storeId,
      store.name || '',
      planned, actual, discount || '', expected || '', actualCashback, net,
      comment
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
