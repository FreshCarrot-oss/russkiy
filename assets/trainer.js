/* =====================================================================
   trainer.js — движок тренажёра. Страница темы вызывает Trainer.start(cfg).

   Два вида тем:
     kind: 'choice' — в слове/фразе есть пропуск «#», нужно выбрать вариант
                      (буква е/и, н/нн, слово-пароним, форма слова…)
     kind: 'stress' — нужно нажать на ударную гласную

   Режимы (вкладки): Учить · Диктант · ЕГЭ (если задан cfg.exam) · Список · Правила
   Подробное описание настроек — в templates/README-шаблон.md
   ===================================================================== */
(function () {
  'use strict';
  const { esc, plural, shuffle, pickWeighted, pickN } = Core;
  const VOW = 'аеёиоуыэюя', UP = 'АЕЁИОУЫЭЮЯ', ACUTE = '́';
  const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  let cfg, S, ITEMS, CATS, isStress, wordOpts;

  /* ============ подготовка данных ============ */
  function parseStress(raw) {
    let stress = -1;
    for (let i = 0; i < raw.length; i++) if (UP.includes(raw[i])) stress = i;
    const lower = raw.toLowerCase();
    return { lower, plain: lower.replace(/ё/g, 'е'), stress };
  }
  function normalize() {
    const seen = new Set();
    ITEMS = cfg.items.map((it, i) => {
      let x;
      if (isStress) {
        const p = parseStress(it.w);
        x = Object.assign({}, it, p, { id: (it.c || '') + ':' + it.w });
      } else {
        const o = it.o || cfg.options;
        x = Object.assign({}, it, { o, id: it.id || (it.t + '|' + it.a) });
        x.nogap = !it.t.includes('#');
        x.full = x.nogap ? it.t : it.t.split('#').join(it.a);
        x.letters = !x.nogap && o.every(v => v.length <= 2);
      }
      if (seen.has(x.id)) x.id += '#' + i;
      seen.add(x.id);
      return x;
    });
    wordOpts = !isStress && ITEMS.some(x => !x.letters);
    CATS = cfg.categories || [];
  }

  /* ============ отображение слов ============ */
  /* слово с ударением: аэропОрты -> аэропо́рты (ударная выделена) */
  function stressHTML(raw) {
    let out = '';
    for (const ch of raw) {
      if (UP.includes(ch)) { const l = ch.toLowerCase(); out += `<span class="st">${l}${l === 'ё' ? '' : ACUTE}</span>`; }
      else out += esc(ch);
    }
    return out;
  }
  /* в пометках ударные гласные тоже прописные */
  const noteStressHTML = s => esc(s).replace(/[а-яё]*[АЕЁИОУЫЭЮЯ][а-яё]*/g, w => stressHTML(w));
  /* «пр[и]вередливый» в правилах -> выделенная буква */
  const bracketHTML = s => esc(s).replace(/\[([^\]]+)\]/g, '<span class="pre">$1</span>');

  /* текст с пропусками; state: null — вопрос; {ok} — ответ показан; {shown:'слово'} — подставлено слово */
  /* подпись варианта: у слитно/раздельно значения '', ' ', '-' показываются словами */
  const optName = o => (cfg.optionNames && cfg.optionNames[o] != null) ? cfg.optionNames[o] : o;
  /* видимое значение ответа внутри слова */
  const gapVal = a => a === '' ? '' : a;
  function gapHTML(it, state) {
    if (it.nogap) {
      if (!state || state.shown != null) return wrapWords(it.t, '');
      return strikeHTML(it, state.ok ? 'ok' : 'no');
    }
    if (!state && cfg.paren && cfg.optionNames && it.o.every(o => o in cfg.optionNames)) return parenHTML(it.t);
    let gap;
    if (!state) gap = `<span class="gap ${it.letters ? 'q' : 'qw'}"></span>`;
    else if (state.shown != null) gap = `<span class="gap shown">${esc(state.shown)}</span>`;
    else gap = `<span class="gap ${state.ok ? 'ok' : 'no'}${it.a === '' ? ' join' : it.a.trim() === '' ? ' blank' : ''}">${esc(gapVal(it.a))}</span>`;
    return wrapWords(it.t, gap);
  }
  /* «(не)знал», «(в)течение» — как в КИМ */
  function parenHTML(t) {
    return t.split(' ').map(w => {
      if (!w.includes('#')) return `<span class="nw">${esc(w)}</span>`;
      const [l, r] = w.split('#');
      if (l && r && r.length < l.length) return `<span class="nw">${esc(l)}<span class="paren">(${esc(r)})</span></span>`;
      return `<span class="nw"><span class="paren">(${esc(l || cfg.gapText || '')})</span>${esc(r)}</span>`;
    }).join(' ');
  }
  function strikeHTML(it, cls) {
    const i = it.t.indexOf(it.a);
    if (i < 0) return esc(it.t);
    return esc(it.t.slice(0, i)) + `<s class="strike ${cls || ''}">${esc(it.a)}</s>` + esc(it.t.slice(i + it.a.length));
  }
  const fullHTML = it => it.nogap ? strikeHTML(it, '') : wrapWords(it.t, `<span class="pre">${esc(gapVal(it.a))}</span>`);
  function wrapWords(t, gap) {
    return t.split(' ').map(w => `<span class="nw">${w.split('#').map(esc).join(gap)}</span>`).join(' ');
  }
  function shownText(it) { return isStress ? it.lower : it.full; }
  function answerHTML(it) { return isStress ? stressHTML(it.w) : fullHTML(it); }
  function noteHTML(it, after) {
    if (!it.n) return '';
    return isStress ? (after ? noteStressHTML(it.n) : esc(it.n.toLowerCase())) : esc(it.n);
  }
  function whyHTML(it) {
    const parts = [];
    if (it.n) parts.push(`<span>${noteHTML(it, true)}</span>`);
    const g = it.g && cfg.groups && cfg.groups[it.g];
    if (g) parts.push(`<span><strong>${esc(g.h)}.</strong> ${g.p}</span>`);
    return parts.length ? `<div class="why">${parts.join('')}</div>` : '';
  }
  function vowelButtons(it) {
    return [...it.plain].map((ch, i) => VOW.includes(ch)
      ? `<button type="button" class="v" data-i="${i}" aria-label="${ch}, ${i + 1}-я буква">${ch}</button>`
      : `<span class="c">${esc(ch)}</span>`).join('');
  }
  function revealStress(el, it, picked) {
    el.classList.add('done');
    $$('.v', el).forEach(b => {
      const i = +b.dataset.i; b.disabled = true;
      if (i === it.stress) { b.classList.add('ok'); b.textContent = it.lower[i] === 'ё' ? 'ё' : it.lower[i] + ACUTE; }
      else if (i === picked) b.classList.add('no');
    });
  }
  function optionOrder(it) { return it.letters || cfg.optionNames ? it.o.slice() : shuffle(it.o); }

  /* ============ сводка и прогресс ============ */
  function saveSummary() {
    const learned = ITEMS.filter(x => S.learned(x.id)).length;
    const errs = ITEMS.filter(x => S.error(x.id));
    S.saveSummary({ title: cfg.title, learned, total: ITEMS.length, errors: errs.length, errs: errs.slice(0, 15).map(shownText) });
    const t = $('#learnedTxt');
    if (t) {
      t.textContent = `выучено ${learned} из ${ITEMS.length}`;
      $('#learnedBar').style.width = (learned / ITEMS.length * 100).toFixed(1) + '%';
    }
    $$('[data-errcount]').forEach(x => { x.textContent = errs.length; });
  }
  function record(it, ok) { S.record(it.id, ok); }
  const weight = it => S.weight(it.id);

  /* ============ каркас страницы ============ */
  function shell() {
    const tabs = [['learn', 'Учить'], ['dictation', 'Диктант']];
    if (cfg.exam) tabs.push(['exam', 'ЕГЭ']);
    tabs.push(['list', 'Список']);
    const rulesTpl = $('template#rules');
    if (rulesTpl || cfg.rules) tabs.push(['rules', 'Правила']);
    const app = $('#app');
    app.className = 'wrap';
    app.innerHTML = `
      <div class="topbar"><a class="back" href="index.html">← Все темы</a><span data-theme-toggle></span></div>
      <header class="top">
        <div class="brand">
          <span class="eyebrow">${esc(cfg.eyebrow || '')}</span>
          <h1>${cfg.titleHTML || esc(cfg.title)}</h1>
        </div>
        <div class="learned"><span id="learnedTxt"></span><div class="bar"><i id="learnedBar"></i></div></div>
      </header>
      <nav class="tabs" role="tablist" aria-label="Режимы">
        ${tabs.map(([k, l]) => `<button role="tab" type="button" data-tab="${k}" aria-controls="${k}">${l}</button>`).join('')}
      </nav>
      <main>
        <section id="learn" role="tabpanel"></section>
        <section id="dictation" role="tabpanel" hidden></section>
        ${cfg.exam ? '<section id="exam" role="tabpanel" hidden></section>' : ''}
        <section id="list" role="tabpanel" hidden></section>
        ${rulesTpl || cfg.rules ? '<section id="rules" role="tabpanel" hidden></section>' : ''}
      </main>
      <footer class="foot">
        ${cfg.source ? `<span>${cfg.source}</span>` : ''}
        <span>${Core.storageOK() ? 'Прогресс хранится только в этом браузере. Подробнее — на главной странице.' : '<b>Браузер не сохраняет прогресс</b> (режим инкогнито?). После закрытия вкладки результаты пропадут.'}</span>
        ${Core.devHTML()}
      </footer>`;
    return tabs.map(t => t[0]);
  }
  function show(id) {
    $$('[role="tab"]').forEach(t => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    $$('main > section').forEach(s => { s.hidden = s.id !== id; });
    const p = S.prefs(); p.tab = id; S.setPrefs(p);
    if (id === 'list') renderList();
    if (id === 'exam' && !exam.cur) examNew();
    window.scrollTo({ top: 0 });
  }

  /* ============ УЧИТЬ ============ */
  const L = { set: 'all', cur: null, done: false, recent: [], timer: 0, ok: 0, bad: 0, streak: 0 };
  function learnPool() {
    return ITEMS.filter(x => L.set === 'all' || (L.set === 'err' ? S.error(x.id) : x.c === L.set));
  }
  function renderLearn() {
    const sec = $('#learn');
    sec.innerHTML = `
      <div class="chips" id="lChips"></div>
      <div class="card drill" id="lCard">
        <div class="dmeta"><span class="cat" id="lCat"></span><span id="lLeft"></span></div>
        <p class="task-line">${esc(cfg.prompt || (isStress ? 'Нажми на ударную гласную' : 'Выбери вариант'))}</p>
        <div class="word" id="lWord"></div>
        <p class="hintline" id="lHint"></p>
        <div class="fb" id="lFb" hidden></div>
        <div class="keys" id="lKeys"></div>
        <div class="row" id="lAfter" hidden><button type="button" class="btn" id="lNext">Дальше</button></div>
        <div class="row" id="lBefore">
          <button type="button" class="btn ghost small" id="lHintBtn" hidden>Подсказка</button>
          <button type="button" class="btn ghost small" id="lSkip">Не знаю</button>
        </div>
      </div>
      <div class="empty card" id="lEmpty" hidden>
        <p>Ошибок пока нет. Слово попадает сюда после ошибки и уходит после двух верных ответов подряд.</p>
        <button type="button" class="btn ghost" id="lAll">Тренировать всё</button>
      </div>
      <div class="sess" aria-live="polite">
        <div><b id="sOk">0</b><span>верно за сессию</span></div>
        <div><b id="sBad">0</b><span>ошибок</span></div>
        <div><b id="sStreak">0</b><span>подряд без ошибок</span></div>
      </div>`;
    renderChips();
  }
  function renderChips() {
    const counts = {};
    ITEMS.forEach(x => { counts[x.c] = (counts[x.c] || 0) + 1; });
    $('#lChips').innerHTML =
      `<button type="button" class="chip" data-set="all" aria-pressed="${L.set === 'all'}">Все <small>${ITEMS.length}</small></button>`
      + CATS.map(c => `<button type="button" class="chip" data-set="${esc(c.key)}" aria-pressed="${L.set === c.key}">${esc(c.label)} <small>${counts[c.key] || 0}</small></button>`).join('')
      + `<button type="button" class="chip err" data-set="err" aria-pressed="${L.set === 'err'}">Мои ошибки <small data-errcount>0</small></button>`;
    saveSummary();
  }
  function learnNext() {
    clearTimeout(L.timer);
    const pool = learnPool();
    $('#lCard').hidden = !pool.length; $('#lEmpty').hidden = !!pool.length;
    if (!pool.length) return;
    const it = pickWeighted(pool, weight, L.recent);
    L.cur = it; L.done = false;
    L.recent.push(it.id); if (L.recent.length > Math.min(10, Math.floor(pool.length / 2))) L.recent.shift();
    const cat = CATS.find(c => c.key === it.c);
    $('#lCat').textContent = cat ? cat.label : '';
    $('#lLeft').textContent = L.set === 'err' ? `в ошибках: ${pool.length}` : `в наборе: ${pool.length}`;
    const w = $('#lWord');
    $('#lFb').hidden = true; $('#lAfter').hidden = true; $('#lBefore').hidden = false;
    $('#lHint').innerHTML = isStress ? noteHTML(it, false) : '';
    $('#lHintBtn').hidden = !it.h;
    const keys = $('#lKeys');
    if (isStress) {
      w.className = 'word stress'; w.style.setProperty('--len', it.plain.length);
      w.innerHTML = vowelButtons(it);
      keys.hidden = true;
    } else {
      w.className = 'word' + (it.t.length > 28 ? ' long' : '');
      w.innerHTML = gapHTML(it, null);
      const opts = optionOrder(it);
      keys.hidden = false;
      const labels = opts.map(optName);
      const short = labels.every(o => o.length <= 11);
      keys.className = 'keys' + (it.letters && !cfg.optionNames ? '' : (short && opts.length === 3 ? ' words3' : short && opts.length % 2 === 0 ? ' words2' : ' words'));
      keys.style.setProperty('--n', Math.min(opts.length, 4));
      keys.innerHTML = opts.map(o => `<button type="button" class="key" data-o="${esc(o)}">${esc(optName(o))}${cfg.optionLabels && cfg.optionLabels[o] ? `<small>${esc(cfg.optionLabels[o])}</small>` : ''}</button>`).join('');
    }
  }
  function learnAnswer(val) {
    if (L.done) return;
    const it = L.cur; L.done = true;
    const ok = isStress ? val === it.stress : val === it.a;
    record(it, ok);
    ok ? (L.ok++, L.streak++) : (L.bad++, L.streak = 0);
    const w = $('#lWord');
    if (isStress) revealStress(w, it, val);
    else w.innerHTML = gapHTML(it, { ok });
    if (!ok) { w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }
    const fb = $('#lFb');
    fb.className = 'fb ' + (ok ? 'ok' : 'no');
    let label = ok ? 'Верно' : (val == null || val === -1 ? 'Запомни' : 'Ошибка');
    if (!isStress && cfg.optionNames) label += ': ' + optName(it.a);
    if (!isStress && it.nogap) label += ok ? '' : `: лишнее слово — «${it.a}»`;
    const showFull = !ok || (!isStress && (!it.letters || cfg.optionNames));
    fb.innerHTML = `<b class="v">${esc(label)}</b>${showFull && !(isStress && ok) ? `<span class="full">${answerHTML(it)}</span>` : ''}${whyHTML(it)}`;
    fb.hidden = false;
    if (isStress) $('#lHint').innerHTML = '';
    $('#lKeys').hidden = true; $('#lBefore').hidden = true; $('#lAfter').hidden = false;
    if (!ok) $('#lNext').focus({ preventScroll: true });
    $('#sOk').textContent = L.ok; $('#sBad').textContent = L.bad; $('#sStreak').textContent = L.streak;
    saveSummary();
    const auto = cfg.autoNext != null ? cfg.autoNext : (isStress || it.letters);
    if (ok && auto) L.timer = setTimeout(() => { if (L.cur === it && L.done) learnNext(); }, 1100);
  }

  /* ============ ДИКТАНТ ============ */
  const speech = { ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window, voice: null };
  function findVoice() { try { speech.voice = speechSynthesis.getVoices().find(v => /^ru/i.test(v.lang)) || null; } catch (e) {} }
  if (speech.ok) { findVoice(); try { speechSynthesis.onvoiceschanged = findVoice; } catch (e) {} }
  function say(text) {
    if (!speech.ok) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[()]/g, ''));
      u.lang = 'ru-RU'; u.rate = 0.8; if (speech.voice) u.voice = speech.voice;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  const D = { mode: 'pick', n: 20, errOnly: false, items: [], ans: [], checked: false };
  const normText = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^а-я]+/g, ' ').trim();
  function renderDictation() {
    const sizes = cfg.dictationSizes || [10, 20, 30];
    const canEar = !isStress && cfg.ear;
    $('#dictation').innerHTML = `
      ${canEar ? `<div class="set"><div class="seg" role="group" aria-label="Вид диктанта" id="dMode">
        <button type="button" data-m="pick" aria-pressed="true">Выбрать ответ</button>
        <button type="button" data-m="ear" aria-pressed="false">На слух</button></div></div>` : ''}
      <div class="set">
        <div class="seg" role="group" aria-label="Сколько заданий" id="dN">
          ${sizes.map(n => `<button type="button" data-n="${n}" aria-pressed="${n === 20}">${n}</button>`).join('')}
          <button type="button" data-n="9999" aria-pressed="false">Все</button>
        </div>
        <button type="button" class="chip err" id="dErr" aria-pressed="false">Из моих ошибок</button>
      </div>
      <div class="card">
        <div id="dScore" class="scroll-anchor" hidden></div>
        <p class="task-line" id="dHint"></p>
        <p class="speechnote" id="dSpeech" hidden>Этот браузер не умеет читать текст вслух. Попробуй Chrome или Safari.</p>
        <ol class="dlist" id="dList"></ol>
        <div class="row">
          <button type="button" class="btn ghost" id="dNew">Новый диктант</button>
          <button type="button" class="btn" id="dCheck">Проверить</button>
        </div>
      </div>`;
  }
  function dictNew() {
    const pool = D.errOnly ? ITEMS.filter(x => S.error(x.id)) : ITEMS;
    D.items = pickN(pool, Math.min(D.n, pool.length), weight);
    D.ans = D.items.map(() => null); D.checked = false;
    $('#dScore').hidden = true;
    const hint = $('#dHint'); hint.hidden = false;
    hint.textContent = D.mode === 'ear'
      ? 'Нажми ▶, послушай и напиши целиком. Проверяется всё написание, а не только пропуск.'
      : isStress ? 'Поставь ударение в каждом слове и нажми «Проверить». Ответы покажутся только в конце.'
      : 'Выбери ответ в каждой строке и нажми «Проверить». Ответы покажутся только в конце.';
    $('#dSpeech').hidden = !(D.mode === 'ear' && !speech.ok);
    $('#dCheck').disabled = !D.items.length;
    const list = $('#dList');
    if (!D.items.length) { list.innerHTML = '<li><span></span><span class="task-line">В ошибках пока пусто. Сними фильтр «Из моих ошибок».</span></li>'; return; }
    list.innerHTML = D.items.map((it, i) => {
      if (isStress) return `<li data-k="${i}"><span class="n">${i + 1}.</span><div class="body"><div class="word stress" style="--len:${it.plain.length}">${vowelButtons(it)}</div></div></li>`;
      if (D.mode === 'ear') return `<li class="listen" data-k="${i}"><span class="n">${i + 1}.</span><div class="body"><button type="button" class="play" aria-label="Прослушать ${i + 1}">${PLAY}</button><input class="tin" id="tin-${i}" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Ответ ${i + 1}"></div></li>`;
      const opts = optionOrder(it);
      return `<li data-k="${i}"><span class="n">${i + 1}.</span><div class="body"><span class="txt">${gapHTML(it, null)}</span>
        <span class="pick${it.letters && !cfg.optionNames ? '' : ' words'}">${opts.map(o => `<button type="button" data-o="${esc(o)}" aria-pressed="false">${esc(optName(o))}</button>`).join('')}</span></div></li>`;
    }).join('');
  }
  function dictCheck() {
    if (D.checked) return;
    D.checked = true;
    let good = 0;
    $$('#dList > li').forEach((li, i) => {
      const it = D.items[i]; if (!it) return;
      let ok, missed;
      if (isStress) {
        const p = D.ans[i];
        ok = p === it.stress; missed = p == null;
        const wd = $('.word', li); $$('.v', wd).forEach(b => b.classList.remove('pick'));
        revealStress(wd, it, p);
      } else if (D.mode === 'ear') {
        const inp = $('.tin', li); const typed = inp.value;
        ok = normText(typed) === normText(it.full); missed = !typed.trim();
        inp.readOnly = true; inp.classList.add(ok ? 'ok' : 'no');
      } else {
        ok = D.ans[i] === it.a; missed = D.ans[i] == null;
        $('.txt', li).innerHTML = gapHTML(it, { ok });
        $$('.pick button', li).forEach(b => { b.disabled = true; });
      }
      if (ok) good++;
      record(it, ok);
      li.insertAdjacentHTML('beforeend', `<div class="res">${ok ? '<span class="ok">верно</span>'
        : `<span class="no">${missed ? 'пропущено' : 'ошибка'}</span><span class="full">${answerHTML(it)}</span>`}${it.n ? `<span class="muted">${noteHTML(it, true)}</span>` : ''}</div>`);
    });
    const total = D.items.length, bad = total - good;
    const sc = $('#dScore');
    sc.innerHTML = `<div class="score">${good} из ${total}<small>${bad ? `${bad} ${plural(bad, 'ошибка добавлена', 'ошибки добавлены', 'ошибок добавлено')} в «Мои ошибки»` : 'без единой ошибки'}</small></div>`;
    sc.hidden = false; $('#dHint').hidden = true; $('#dCheck').disabled = true;
    saveSummary();
    sc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ============ КАК НА ЕГЭ ============ */
  const exam = { cur: null, checked: false, sel: new Set(), fix: null };
  function renderExamShell() {
    const e = S.exam();
    $('#exam').innerHTML = `
      <div class="card kim" id="kim"></div>
      <div class="row">
        <button type="button" class="btn ghost" id="eNew">Другое задание</button>
        <button type="button" class="btn" id="eCheck">Проверить</button>
      </div>
      <p class="task-line" id="eStat"></p>`;
    examStat(e);
  }
  function examStat(e) {
    $('#eStat').textContent = e.n ? `Решено заданий: ${e.n}, без ошибок: ${e.ok} (${Math.round(e.ok / e.n * 100)}%). На экзамене за это задание дают ${cfg.exam.points || 1} ${plural(cfg.exam.points || 1, 'балл', 'балла', 'баллов')}.` : `Формат и формулировка — как в КИМ ЕГЭ${cfg.exam.task ? `, задание ${cfg.exam.task}` : ''}.`;
  }
  function examNew() {
    exam.checked = false; exam.sel = new Set(); exam.fix = null;
    const t = cfg.exam.type;
    const builders = { stressSelect: buildStressSelect, odd: buildOdd, rows: buildRows, digits: buildDigits, select: buildSelect };
    exam.cur = builders[t]();
    renderExam();
    $('#eCheck').disabled = false;
  }
  function buildStressSelect() {
    const its = pickN(ITEMS, 5, weight);
    let correct;
    do { correct = its.map(() => Math.random() < 0.5); } while (correct.every(Boolean) || !correct.some(Boolean));
    const shownIdx = its.map((it, i) => {
      if (correct[i]) return it.stress;
      const vs = [...it.plain].map((ch, j) => VOW.includes(ch) && j !== it.stress ? j : -1).filter(j => j >= 0);
      if (!vs.length) { correct[i] = true; return it.stress; }
      return vs[Math.floor(Math.random() * vs.length)];
    });
    return { items: its, correct, shownIdx,
      q: 'Укажите варианты ответов, в которых верно выделена буква, обозначающая ударный гласный звук. Запишите номера ответов.' };
  }
  function buildOdd() {
    const pool = ITEMS.filter(x => x.o.length > 1 && !x.nogap);
    const its = [];
    const used = new Set();
    while (its.length < 5) {
      const x = pickWeighted(pool.filter(y => !used.has(y.o.join('|'))), weight);
      if (!x) break;
      used.add(x.o.join('|')); its.push(x);
    }
    const wrongI = Math.floor(Math.random() * its.length);
    const alts = its[wrongI].o.filter(o => o !== its[wrongI].a);
    const wrongShown = alts[Math.floor(Math.random() * alts.length)];
    return { items: its, wrongI, wrongShown, q: cfg.exam.q || 'В одном из выделенных слов допущена ошибка. Исправьте ошибку и запишите слово правильно.' };
  }
  function buildRows() {
    const per = cfg.exam.per || 3;
    const pool = ITEMS.filter(x => x.letters && x.t.split('#').length === 2);
    const sigOf = x => x.o.slice().sort().join('/');
    let rows, same;
    for (let attempt = 0; attempt < 60; attempt++) {
      rows = []; same = [];
      const used = new Set();
      for (let r = 0; r < 5; r++) {
        const left = pool.filter(x => !used.has(x.id));
        const bySig = {};
        left.forEach(x => { (bySig[sigOf(x)] = bySig[sigOf(x)] || []).push(x); });
        const sigs = Object.keys(bySig).filter(k => bySig[k].length >= per);
        if (!sigs.length) break;
        const k = sigs[Math.floor(Math.random() * sigs.length)];
        const items = bySig[k];
        const byA = {}; items.forEach(x => { (byA[x.a] = byA[x.a] || []).push(x); });
        const letters = Object.keys(byA).filter(a => byA[a].length >= per);
        let row = null;
        if (Math.random() < 0.45 && letters.length) {
          row = pickN(byA[letters[Math.floor(Math.random() * letters.length)]], per, weight);
        } else {
          for (let tries = 0; tries < 20 && !row; tries++) {
            const cand = pickN(items, per, weight);
            if (new Set(cand.map(x => x.a)).size > 1) row = cand;
          }
          if (!row) row = pickN(items, per, weight);
        }
        row.forEach(x => used.add(x.id));
        rows.push(row); same.push(new Set(row.map(x => x.a)).size === 1);
      }
      if (rows.length === 5 && same.some(Boolean) && !same.every(Boolean)) break;
    }
    return { rows, same, q: cfg.exam.q || 'Укажите варианты ответов, в которых во всех словах одного ряда пропущена одна и та же буква. Запишите номера ответов.' };
  }
  /* «Укажите варианты, в которых … пишется СЛИТНО»: ряды по per слов, верный ряд — где у всех ответ pick */
  function buildSelect() {
    const per = cfg.exam.per || 1, vars = cfg.exam.variants;
    const v = vars[Math.floor(Math.random() * vars.length)];
    const pool = ITEMS.filter(x => x.o.includes(v.pick));
    const yes = pool.filter(x => x.a === v.pick), no = pool.filter(x => x.a !== v.pick);
    let rows, good;
    do {
      const used = new Set(); rows = []; good = [];
      for (let r = 0; r < 5; r++) {
        const want = Math.random() < 0.45;
        let row;
        if (want) row = pickN(yes.filter(x => !used.has(x.id)), per, weight);
        else {
          const first = pickN(no.filter(x => !used.has(x.id)), 1, weight);
          const rest = pickN(pool.filter(x => !used.has(x.id) && !first.includes(x)), per - 1, weight);
          row = shuffle(first.concat(rest));
        }
        row.forEach(x => used.add(x.id));
        rows.push(row); good.push(row.length === per && row.every(x => x.a === v.pick));
      }
    } while (!good.some(Boolean) || good.every(Boolean) || rows.some(r => r.length !== per));
    return { rows, good, pick: v.pick, q: v.q };
  }
  function buildDigits() {
    const vars = cfg.exam.variants;
    const v = vars[Math.floor(Math.random() * vars.length)];
    let its;
    do { its = pickN(ITEMS.filter(x => x.t.split('#').length === 2), cfg.exam.count || 6, weight); }
    while (its.every(x => x.a === v.pick) || !its.some(x => x.a === v.pick));
    return { items: its, pick: v.pick, q: v.q };
  }

  function renderExam() {
    const e = exam.cur, t = cfg.exam.type, kim = $('#kim');
    let html = `<p class="q">${cfg.exam.task ? `${cfg.exam.task}. ` : ''}${esc(e.q)}</p>`;
    if (t === 'stressSelect') {
      html += `<ol>${e.items.map((it, i) => {
        const w = [...it.lower].map((ch, j) => j === e.shownIdx[i] ? ch.toUpperCase() : ch).join('');
        return `<li role="checkbox" aria-checked="false" data-i="${i}" tabindex="0"><span class="n">${i + 1})</span><span class="t">${esc(w)}</span></li>`;
      }).join('')}</ol>`;
    } else if (t === 'odd') {
      html += `<ol>${e.items.map((it, i) => `<li role="radio" aria-checked="false" data-i="${i}" tabindex="0"><span class="n">${i + 1})</span><span class="t">${gapHTML(it, { shown: i === e.wrongI ? e.wrongShown : it.a })}</span></li>`).join('')}</ol>
        <div id="fixBox" hidden><p class="task-line">Какое слово должно стоять вместо выделенного?</p><div class="pick words" id="fixOpts"></div></div>`;
    } else if (t === 'rows') {
      html += `<ol>${e.rows.map((row, i) => `<li role="checkbox" aria-checked="false" data-i="${i}" tabindex="0"><span class="n">${i + 1})</span><span class="t">${row.map(it => gapHTML(it, null)).join(', ')}</span></li>`).join('')}</ol>`;
    } else if (t === 'select') {
      html += `<ol>${e.rows.map((row, i) => `<li role="checkbox" aria-checked="false" data-i="${i}" tabindex="0"><span class="n">${i + 1})</span><span class="t">${row.map(it => parenHTML(it.t)).join(', ')}</span></li>`).join('')}</ol>`;
    } else if (t === 'digits') {
      html += `<p class="digits">${e.items.map((it, i) => {
        const [a, b] = it.t.split('#');
        return `<span class="nw">${esc(a)}<button type="button" class="dg" data-i="${i}" aria-pressed="false">(${i + 1})</button>${esc(b)}</span>`;
      }).join('; ')}.</p><p class="task-line">Нажимай на цифры в скобках, чтобы выбрать их.</p>`;
    }
    html += `<div class="answerbox"><span class="lab">Ответ</span><span class="val" id="eVal"></span></div><div class="verdict" id="eVerdict" hidden></div>`;
    kim.innerHTML = html;
    updateAnswerBox();
  }
  function updateAnswerBox() {
    const t = cfg.exam.type, v = $('#eVal'); if (!v) return;
    if (t === 'odd') v.textContent = exam.fix ? exam.fix : '';
    else v.textContent = [...exam.sel].sort((a, b) => a - b).map(i => i + 1).join('');
  }
  function examToggle(i) {
    if (exam.checked) return;
    const t = cfg.exam.type;
    if (t === 'odd') {
      exam.sel = new Set([i]); exam.fix = null;
      $$('#kim li').forEach(li => li.setAttribute('aria-checked', String(+li.dataset.i === i)));
      const it = exam.cur.items[i];
      const shownW = i === exam.cur.wrongI ? exam.cur.wrongShown : it.a;
      $('#fixOpts').innerHTML = shuffle(it.o.filter(o => o !== shownW)).map(o => `<button type="button" data-fix="${esc(o)}" aria-pressed="false">${esc(o)}</button>`).join('');
      $('#fixBox').hidden = false;
    } else {
      exam.sel.has(i) ? exam.sel.delete(i) : exam.sel.add(i);
      if (t === 'digits') $$('#kim .dg').forEach(b => b.setAttribute('aria-pressed', String(exam.sel.has(+b.dataset.i))));
      else $$('#kim li').forEach(li => li.setAttribute('aria-checked', String(exam.sel.has(+li.dataset.i))));
    }
    updateAnswerBox();
  }
  function examCheck() {
    if (exam.checked) return;
    const e = exam.cur, t = cfg.exam.type;
    let ok, detail = '', key = '';
    if (t === 'stressSelect') {
      const want = new Set(e.correct.map((c, i) => c ? i : -1).filter(i => i >= 0));
      ok = want.size === exam.sel.size && [...want].every(i => exam.sel.has(i));
      key = [...want].map(i => i + 1).join('');
      $$('#kim li').forEach(li => {
        const i = +li.dataset.i, it = e.items[i], judgedRight = want.has(i) === exam.sel.has(i);
        li.classList.add(judgedRight ? 'right' : 'wrong');
        record(it, judgedRight);
        li.insertAdjacentHTML('beforeend', `<span class="res">${e.correct[i] ? 'выделено верно' : 'неверно, правильно'}: <b class="w">${stressHTML(it.w)}</b></span>`);
      });
    } else if (t === 'odd') {
      const sel = [...exam.sel][0];
      const it = e.items[e.wrongI];
      ok = sel === e.wrongI && exam.fix === it.a;
      key = it.a;
      record(it, ok);
      if (sel != null && sel !== e.wrongI) record(e.items[sel], false);
      $$('#kim li').forEach(li => {
        const i = +li.dataset.i;
        if (i === e.wrongI) { li.classList.add('wrong'); li.insertAdjacentHTML('beforeend', `<span class="res">ошибка здесь, правильно: <b>${esc(it.a)}</b></span>`); }
        else if (i === sel) li.classList.add('wrong');
      });
      detail = whyHTML(it);
      if (sel === e.wrongI && exam.fix !== it.a) detail = `<span>Строку нашёл верно, но исправление другое.</span>` + detail;
    } else if (t === 'rows') {
      const want = new Set(e.same.map((s, i) => s ? i : -1).filter(i => i >= 0));
      ok = want.size === exam.sel.size && [...want].every(i => exam.sel.has(i));
      key = [...want].map(i => i + 1).join('');
      $$('#kim li').forEach(li => {
        const i = +li.dataset.i, row = e.rows[i];
        li.classList.add(want.has(i) === exam.sel.has(i) ? 'right' : 'wrong');
        li.querySelector('.t').innerHTML = row.map(it => fullHTML(it)).join(', ');
        li.insertAdjacentHTML('beforeend', `<span class="res">${e.same[i] ? 'везде одна буква' : 'буквы разные'}</span>`);
      });
    } else if (t === 'select') {
      const want = new Set(e.good.map((g, i) => g ? i : -1).filter(i => i >= 0));
      ok = want.size === exam.sel.size && [...want].every(i => exam.sel.has(i));
      key = [...want].map(i => i + 1).join('');
      $$('#kim li').forEach(li => {
        const i = +li.dataset.i, row = e.rows[i], right = want.has(i) === exam.sel.has(i);
        li.classList.add(right ? 'right' : 'wrong');
        row.forEach(it => record(it, right));
        li.querySelector('.t').innerHTML = row.map(it => `${fullHTML(it)} <span class="muted">(${esc(optName(it.a))})</span>`).join(', ');
      });
    } else if (t === 'digits') {
      const want = new Set(e.items.map((it, i) => it.a === e.pick ? i : -1).filter(i => i >= 0));
      ok = want.size === exam.sel.size && [...want].every(i => exam.sel.has(i));
      key = [...want].map(i => i + 1).join('');
      e.items.forEach((it, i) => record(it, want.has(i) === exam.sel.has(i)));
      $('#kim .digits').innerHTML = e.items.map(it => `<span class="nw">${fullHTML(it)}</span>`).join('; ') + '.';
      detail = e.items.filter(it => it.g && cfg.groups && cfg.groups[it.g]).slice(0, 3).map(it => `<span><b class="w">${fullHTML(it)}</b> — ${cfg.groups[it.g].h.toLowerCase()}.</span>`).join('');
    }
    exam.checked = true;
    const v = $('#eVerdict');
    v.className = 'verdict ' + (ok ? 'ok' : 'no');
    v.innerHTML = `<b>${ok ? 'Верно, балл засчитан' : 'Неверно'}</b><span>Правильный ответ: <b>${esc(key || '—')}</b></span>${detail ? `<div class="why">${detail}</div>` : ''}`;
    v.hidden = false;
    $('#eCheck').disabled = true;
    examStat(S.recordExam(ok));
    saveSummary();
  }

  /* ============ СПИСОК ============ */
  const LS_ = { q: '', errOnly: false };
  function renderListShell() {
    $('#list').innerHTML = `
      <input class="search" id="q" type="search" placeholder="Найти" autocomplete="off" aria-label="Найти">
      <div class="chips"><button type="button" class="chip err" id="listErr" aria-pressed="false">Только мои ошибки <small data-errcount>0</small></button></div>
      <div class="dict" id="dictBody"></div>`;
    $('#q').addEventListener('input', e => { LS_.q = e.target.value; renderList(); });
  }
  function renderList() {
    const q = normText(LS_.q);
    const groups = CATS.length ? CATS : [{ key: undefined, label: cfg.title }];
    let html = '';
    groups.forEach(g => {
      const its = ITEMS.filter(x => (!CATS.length || x.c === g.key)
        && (!q || normText(shownText(x)).includes(q) || (!isStress && x.o.some(o => normText(o).includes(q))))
        && (!LS_.errOnly || S.error(x.id)));
      if (!its.length) return;
      html += `<h2><span>${esc(g.label)}</span><span>${its.length}</span></h2><ul>` + its.map(x => {
        const st = S.item(x.id);
        const er = st && st.w ? `<span class="er">${st.w} ${plural(st.w, 'ошибка', 'ошибки', 'ошибок')}${S.learned(x.id) ? ', исправлено' : ''}</span>` : '';
        const alt = !isStress && !x.letters && !x.nogap && !cfg.optionNames ? `<span class="alt">не путать: ${x.o.filter(o => o !== x.a).map(esc).join(', ')}</span>` : '';
        return `<li><span class="w">${answerHTML(x)}</span>${alt}${x.n ? `<span class="nt">${noteHTML(x, true)}</span>` : ''}${er}</li>`;
      }).join('') + '</ul>';
    });
    $('#dictBody').innerHTML = html || `<div class="empty"><p>${LS_.errOnly ? 'Ошибок пока нет.' : 'Ничего не найдено.'}</p></div>`;
    saveSummary();
  }

  /* ============ ПРАВИЛА ============ */
  function renderRules() {
    const sec = $('#rules'); if (!sec) return;
    const fmt = s => isStress ? stressHTML(s) : bracketHTML(s);
    let html = '';
    const tpl = $('template#rules');
    if (tpl) html += tpl.innerHTML;
    if (cfg.rules) html += cfg.rules.map(r => `<article class="card rule">
      <h3>${esc(r.h)}</h3>${r.p ? `<p>${r.p}</p>` : ''}
      ${r.ex ? `<div class="ex">${r.ex.map(s => `<span>${fmt(s)}</span>`).join('')}</div>` : ''}
      ${r.trap ? `<span class="tag">${esc(r.trapLabel || 'Но')}</span><div class="ex">${r.trap.map(s => `<span>${fmt(s)}</span>`).join('')}</div>` : ''}
    </article>`).join('');
    if (cfg.rulesFromGroups && cfg.groups) html += Object.keys(cfg.groups).map(k => {
      const its = ITEMS.filter(x => x.g === k);
      if (!its.length) return '';
      return `<article class="card rule"><h3>${esc(cfg.groups[k].h)}</h3><p>${cfg.groups[k].p}</p>
        <div class="ex">${its.map(x => `<span>${answerHTML(x)}</span>`).join('')}</div></article>`;
    }).join('');
    sec.innerHTML = html;
    /* в шаблоне можно писать <w>аэропОрты</w> или <w>пр[и]вередливый</w> */
    $$('w', sec).forEach(el => { const s = document.createElement('span'); s.className = 'w'; s.innerHTML = fmt(el.textContent); el.replaceWith(s); });
  }

  /* ============ события ============ */
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target;
      const tab = t.closest('[role="tab"]'); if (tab) return show(tab.dataset.tab);
      /* учить */
      const chip = t.closest('#lChips .chip');
      if (chip) { L.set = chip.dataset.set; renderChips(); return learnNext(); }
      const key = t.closest('#lKeys .key'); if (key) return learnAnswer(key.dataset.o);
      const v = t.closest('.v');
      if (v && !v.disabled) {
        if (v.closest('#lWord')) return learnAnswer(+v.dataset.i);
        const li = v.closest('#dList > li');
        if (li && !D.checked) { D.ans[+li.dataset.k] = +v.dataset.i; $$('.v', li).forEach(b => b.classList.toggle('pick', b === v)); }
        return;
      }
      if (t.closest('#lSkip')) return learnAnswer(isStress ? -1 : null);
      if (t.closest('#lNext')) return learnNext();
      if (t.closest('#lAll')) { L.set = 'all'; renderChips(); return learnNext(); }
      if (t.closest('#lHintBtn')) { $('#lHint').textContent = L.cur.h; t.closest('#lHintBtn').hidden = true; return; }
      /* диктант */
      const pb = t.closest('#dList .pick button');
      if (pb && !D.checked) {
        const li = pb.closest('li'); D.ans[+li.dataset.k] = pb.dataset.o;
        $$('.pick button', li).forEach(b => b.setAttribute('aria-pressed', String(b === pb)));
        return;
      }
      const play = t.closest('.play');
      if (play) { const k = +play.closest('li').dataset.k; say(D.items[k].full); const inp = $('#tin-' + k); if (inp && !D.checked) inp.focus({ preventScroll: true }); return; }
      const m = t.closest('#dMode button');
      if (m) { D.mode = m.dataset.m; $$('#dMode button').forEach(b => b.setAttribute('aria-pressed', String(b === m))); return dictNew(); }
      const nb = t.closest('#dN button');
      if (nb) { D.n = +nb.dataset.n; $$('#dN button').forEach(b => b.setAttribute('aria-pressed', String(b === nb))); return dictNew(); }
      if (t.closest('#dErr')) { D.errOnly = !D.errOnly; t.closest('#dErr').setAttribute('aria-pressed', String(D.errOnly)); return dictNew(); }
      if (t.closest('#dNew')) { dictNew(); return window.scrollTo({ top: 0 }); }
      if (t.closest('#dCheck')) return dictCheck();
      /* ЕГЭ */
      const li = t.closest('#kim li[data-i]'); if (li) return examToggle(+li.dataset.i);
      const dg = t.closest('#kim .dg'); if (dg) return examToggle(+dg.dataset.i);
      const fx = t.closest('#fixOpts button');
      if (fx && !exam.checked) { exam.fix = fx.dataset.fix; $$('#fixOpts button').forEach(b => b.setAttribute('aria-pressed', String(b === fx))); return updateAnswerBox(); }
      if (t.closest('#eNew')) return examNew();
      if (t.closest('#eCheck')) return examCheck();
      /* список */
      if (t.closest('#listErr')) { LS_.errOnly = !LS_.errOnly; t.closest('#listErr').setAttribute('aria-pressed', String(LS_.errOnly)); return renderList(); }
    });
    document.addEventListener('keydown', e => {
      if (e.target.matches('.tin') && e.key === 'Enter') {
        e.preventDefault();
        const k = +e.target.closest('li').dataset.k, nx = $('#tin-' + (k + 1));
        if (nx) { nx.focus(); say(D.items[k + 1].full); } else e.target.blur();
        return;
      }
      if (e.target.matches('#kim li') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); return examToggle(+e.target.dataset.i); }
      if ($('#learn').hidden || e.target.matches('input')) return;
      if (!L.done && L.cur && !isStress && L.cur.letters && !cfg.optionNames) {
        const k = e.key.toLowerCase().replace('e', 'е').replace('i', 'и');
        const hit = L.cur.o.find(o => o === k);
        if (hit) { learnAnswer(hit); return; }
      }
      if (L.done && e.key === 'Enter' && !e.target.closest('button:not(#lNext)')) { e.preventDefault(); learnNext(); }
    });
  }

  /* ============ запуск ============ */
  function start(config) {
    cfg = config;
    isStress = cfg.kind === 'stress';
    S = Core.TopicStore(cfg.id);
    Core.askPersist();
    normalize();
    const tabs = shell();
    renderLearn(); renderDictation(); renderListShell(); renderRules();
    if (cfg.exam) renderExamShell();
    bind();
    learnNext(); dictNew();
    if (window.Theme) Theme.mountAll();
    saveSummary();
    const h = (location.hash || '').slice(1), saved = S.prefs().tab;
    show(tabs.includes(h) ? h : (tabs.includes(saved) ? saved : 'learn'));
  }
  window.Trainer = { start, stressHTML, bracketHTML, debug: () => ({ cfg, ITEMS, examNew, exam }) };
})();
