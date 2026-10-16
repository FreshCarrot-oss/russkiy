/* =====================================================================
   core.js — общее для всех страниц: хранение прогресса в браузере,
   экспорт/импорт, мелкие помощники.
   Все ключи в localStorage начинаются с "rt1:".
   ===================================================================== */
(function () {
  'use strict';
  const PREFIX = 'rt1:';

  /* ---------- безопасный доступ к localStorage ---------- */
  let memory = {};           // запасное хранилище, если браузер запрещает localStorage
  let storageOK = true;
  try { const k = PREFIX + '__test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); }
  catch (e) { storageOK = false; }

  function rawGet(key) {
    try { return storageOK ? localStorage.getItem(key) : (key in memory ? memory[key] : null); }
    catch (e) { return null; }
  }
  function rawSet(key, val) {
    try { if (storageOK) localStorage.setItem(key, val); else memory[key] = val; }
    catch (e) { memory[key] = val; }
  }
  function rawDel(key) {
    try { if (storageOK) localStorage.removeItem(key); delete memory[key]; } catch (e) {}
  }
  function getJSON(key, def) {
    const v = rawGet(PREFIX + key);
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  }
  function setJSON(key, val) { rawSet(PREFIX + key, JSON.stringify(val)); }
  function allKeys() {
    const out = [];
    try {
      if (storageOK) { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX)) out.push(k); } }
      else out.push(...Object.keys(memory));
    } catch (e) {}
    return out;
  }

  /* просим браузер не удалять данные сайта (Chrome, Firefox, Edge) */
  function askPersist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  }

  /* ---------- хранилище одной темы ---------- */
  function TopicStore(topicId) {
    const sk = `t:${topicId}:stats`, sumk = `t:${topicId}:sum`, exk = `t:${topicId}:exam`, prk = `t:${topicId}:prefs`;
    let stats = getJSON(sk, {});
    const api = {
      get stats() { return stats; },
      item(id) { return stats[id] || null; },
      learned(id) { const x = stats[id]; return !!(x && x.k >= 2); },
      error(id) { const x = stats[id]; return !!(x && x.w > 0 && x.k < 2); },
      seen(id) { const x = stats[id]; return !!(x && x.s); },
      /* записать ответ: ok — верно или нет */
      record(id, ok) {
        const x = stats[id] || (stats[id] = { s: 0, r: 0, w: 0, k: 0 });
        x.s++; x.t = Date.now();
        if (ok) { x.r++; x.k++; } else { x.w++; x.k = 0; }
        setJSON(sk, stats);
      },
      /* вес для случайного выбора: ошибки чаще, выученное реже */
      weight(id) {
        const x = stats[id];
        if (!x || !x.s) return 3;
        if (x.k === 0) return 8;
        return 3 / (x.k + 1);
      },
      /* краткая сводка для главной страницы */
      saveSummary(info) { setJSON(sumk, Object.assign({ updated: Date.now() }, info)); },
      exam() { return getJSON(exk, { n: 0, ok: 0 }); },
      recordExam(ok) { const e = api.exam(); e.n++; if (ok) e.ok++; e.t = Date.now(); setJSON(exk, e); return e; },
      prefs(def) { return Object.assign({}, def || {}, getJSON(prk, {})); },
      setPrefs(p) { setJSON(prk, p); },
      reset() { stats = {}; rawDel(PREFIX + sk); rawDel(PREFIX + sumk); rawDel(PREFIX + exk); },
    };
    return api;
  }

  /* ---------- сводки всех тем (для главной) ---------- */
  function summaries() {
    const out = {};
    allKeys().forEach(k => {
      const m = k.slice(PREFIX.length).match(/^t:(.+):sum$/);
      if (m) { try { out[m[1]] = JSON.parse(rawGet(k)); } catch (e) {} }
    });
    return out;
  }
  function examOf(topicId) { return getJSON(`t:${topicId}:exam`, { n: 0, ok: 0 }); }

  /* ---------- экспорт / импорт ---------- */
  function exportData() {
    const data = {};
    allKeys().forEach(k => { data[k] = rawGet(k); });
    return { app: 'russian-trainers', v: 1, date: new Date().toISOString(), data };
  }
  function downloadExport() {
    const blob = new Blob([JSON.stringify(exportData())], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `progress-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  /* mode: 'replace' — заменить всё, 'merge' — оставить то, где больше ответов */
  function importData(obj) {
    if (!obj || obj.app !== 'russian-trainers' || typeof obj.data !== 'object') throw new Error('Это не файл прогресса с этого сайта.');
    let n = 0;
    Object.keys(obj.data).forEach(k => {
      if (!k.startsWith(PREFIX) || typeof obj.data[k] !== 'string') return;
      rawSet(k, obj.data[k]); n++;
    });
    return n;
  }
  function resetAll() { allKeys().forEach(rawDel); }

  /* ---------- помощники ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
    return many;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function pickWeighted(pool, weightFn, avoidIds) {
    let c = avoidIds ? pool.filter(x => !avoidIds.includes(x.id)) : pool;
    if (!c.length) c = pool;
    let total = 0; c.forEach(x => { total += weightFn(x); });
    let r = Math.random() * total;
    for (const x of c) { r -= weightFn(x); if (r <= 0) return x; }
    return c[c.length - 1];
  }
  function pickN(pool, n, weightFn) {
    const out = [], left = pool.slice();
    while (out.length < n && left.length) {
      const x = pickWeighted(left, weightFn);
      out.push(x); left.splice(left.indexOf(x), 1);
    }
    return out;
  }
  const notice = () => storageOK
    ? `<b>Прогресс хранится только в этом браузере.</b> Он пропадёт, если очистить данные браузера, зайти в режиме инкогнито или с другого устройства. На iPhone Safari может стереть его, если не заходить на сайт больше недели — добавь сайт на экран «Домой». Перенести прогресс можно через «Сохранить в файл» на главной странице.`
    : `<b>Браузер не даёт сохранять прогресс.</b> Скорее всего, включён режим инкогнито или запрещены данные сайтов. Заниматься можно, но после закрытия вкладки результаты пропадут.`;

  window.Core = {
    storageOK: () => storageOK, askPersist, TopicStore, summaries, examOf,
    exportData, downloadExport, importData, resetAll,
    getJSON, setJSON, esc, plural, shuffle, pickWeighted, pickN, notice,
  };
})();
