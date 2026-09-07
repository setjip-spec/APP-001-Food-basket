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
