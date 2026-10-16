/* =====================================================================
   theme.js — светлая/тёмная тема. Подключается в <head>, чтобы страница
   сразу открывалась в выбранной теме без мигания.
   Переключатель появляется на месте любого элемента с атрибутом data-theme-toggle.
   ===================================================================== */
(function () {
  'use strict';
  var KEY = 'rt1:theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) {
    if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  }
  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return media && media.matches ? 'dark' : 'light';
  }
  apply(saved());

  function sync() {
    var dark = current() === 'dark';
    var els = document.querySelectorAll('.theme-switch');
    for (var i = 0; i < els.length; i++) els[i].setAttribute('aria-checked', dark ? 'true' : 'false');
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (meta) meta.setAttribute('content', dark ? '#121219' : '#f4f4f7');
  }
  function toggle() {
    var next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) {}
    sync();
  }
  function mount(el) {
    if (el.getAttribute('data-mounted')) return;
    el.setAttribute('data-mounted', '1');
    el.innerHTML =
      '<button type="button" class="theme-switch" role="switch" aria-checked="false" aria-label="Тёмная тема" title="Светлая или тёмная тема">' +
        '<span class="ts-track">' +
          '<svg class="ts-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>' +
          '<svg class="ts-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6z"/></svg>' +
          '<span class="ts-knob"></span>' +
        '</span>' +
      '</button>';
    el.querySelector('button').addEventListener('click', toggle);
    sync();
  }
  function mountAll() {
    var els = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  if (media) {
    var onChange = function () { if (!saved()) sync(); };
    if (media.addEventListener) media.addEventListener('change', onChange); else if (media.addListener) media.addListener(onChange);
  }
  document.addEventListener('DOMContentLoaded', mountAll);
  window.Theme = { mountAll: mountAll, toggle: toggle, current: current };
})();
