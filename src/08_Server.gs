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
  return v.includes('кг') || v === 'kg' ? 'кг' : 'шт.';
}

function minimumQty_(unit) {
  return normalizeUnit_(unit) === 'кг' ? 0.1 : 1;
}

function quantityStep_(unit) {
  return normalizeUnit_(unit) === 'кг' ? getSettings_().kgStep : 1;
}

function quantizeQty_(value, unit) {
  const v = Math.max(0, num_(value));
  if (normalizeUnit_(unit) !== 'кг') return Math.round(v);
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
