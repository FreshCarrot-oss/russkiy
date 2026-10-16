#!/usr/bin/env node
/* =====================================================================
   Собирает список тем для главной страницы.
   Берёт все .html в корне сайта (кроме index.html и файлов, начинающихся с «_»),
   читает из них теги <meta name="topic:..."> и записывает topics.js.

   Запуск вручную:  node tools/build-topics.js
   На GitHub это делает автоматически .github/workflows/pages.yml при каждой загрузке.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = fs.readdirSync(root)
  .filter(f => f.toLowerCase().endsWith('.html') && f !== 'index.html' && !f.startsWith('_'))
  .sort();

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const topics = [];
for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const head = html.slice(0, 20000);
  if (/<meta\s+name=["']topic:hidden["']\s+content=["'](1|true|да)["']/i.test(head)) continue;
  const meta = {};
  const re = /<meta\s+name=["']topic:([\w-]+)["']\s+content=["']([^"']*)["']\s*\/?>/gi;
  let m;
  while ((m = re.exec(head))) meta[m[1]] = decode(m[2].trim());
  const titleTag = (head.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const t = {
    file,
    id: meta.id || file.replace(/\.html$/i, ''),
    title: meta.title || (titleTag ? decode(titleTag).split(/\s[—|-]\s/)[0].trim() : file),
    desc: meta.desc || '',
    group: meta.group || 'Другие темы',
    task: meta.task || '',
    grade: meta.grade || '',
    order: Number(meta.order) || 999,
    accent: meta.accent || '',
    count: Number(meta.count) || 0,
    unit: meta.unit || '',
  };
  topics.push(t);
}
topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ru'));

const out = '/* Этот файл создан автоматически (tools/build-topics.js). Править вручную не нужно. */\n'
  + 'window.TOPICS = ' + JSON.stringify(topics, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'topics.js'), out);
console.log(`topics.js: ${topics.length} тем`);
topics.forEach(t => console.log(`  ${String(t.order).padStart(4)}  ${t.file}  —  ${t.title}`));
