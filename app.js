// 家計簿PWA: 画面と保存
(function () {
  'use strict';
  const KEY = 'kakeibo-v1';
  const $ = id => document.getElementById(id);
  const yen = n => Number(n).toLocaleString('ja-JP') + '円';
  const num = n => Number(n).toLocaleString('ja-JP');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => fmt(new Date());
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const PALETTE = ['#f08c2e', '#2a3ea0', '#e04a5f', '#a0522d', '#f2c94c', '#3aa0e8', '#43a047', '#a61e63', '#8e5cf0', '#e53935', '#607d8b', '#1f7a5a'];
  const ICONS = ['🍽️', '👕', '📚', '🚃', '🎮', '⭐', '🍰', '⛽', '🚲', '♨️', '💄', '🍷', '🎰', '✈️', '🛒', '💸', '💳', '🏠', '💡', '📱', '🎁', '💴', '🐶', '🏥', '🎬', '☕', '🍜', '🍺', '🧴', '🎓'];

  // ---------- 保存 ----------
  function defaults() {
    return { txs: [], rules: [], excluded: ['カード引落'], cats: Core.DEFAULT_CATS.map(c => Object.assign({}, c)) };
  }
  function normalize(st) {
    if (!Array.isArray(st.cats) || !st.cats.length) st.cats = defaults().cats;
    delete st.budget; // 予算機能は廃止(旧データに残っていれば捨てる)
    for (const t of st.txs) {
      if (!st.cats.some(c => c.name === t.category && c.type === t.type)) {
        st.cats.push({ name: t.category, type: t.type, icon: '⭐', color: '#7f8c8d' });
      }
    }
    return st;
  }
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* 保存領域が使えない場合は空で開始 */ }
    return normalize(Object.assign(defaults(), s && Array.isArray(s.txs) ? s : {}));
  }
  let state = load();
  let ui = {
    tab: 'input', month: today().slice(0, 7), rep: 'month', repType: 'expense', repCat: null,
    calDay: null, entryType: 'expense', entryDate: today(), catType: 'expense', newIcon: ICONS[0],
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('保存できませんでした(容量不足またはプライベートモード)'); }
  }
  let tt;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 3000);
  }

  // ---------- 部品 ----------
  const catOf = (name, type) => state.cats.find(c => c.name === name && c.type === type) || { name, type, icon: '⭐', color: '#7f8c8d' };
  const icon = c => `<span class="ic" style="background:${c.color}2b">${esc(c.icon)}</span>`;
  const excluded = () => new Set(state.excluded);
  const defaultCat = type => (state.cats.find(c => c.type === type && c.name === 'その他') || state.cats.find(c => c.type === type) || { name: 'その他' }).name;

  function dayLabel(date) {
    const [y, m, d] = date.split('-').map(Number);
    return `${y}年${m}月${d}日(${WD[new Date(y, m - 1, d).getDay()]})`;
  }
  function monthNav(label, prev, next) {
    return `<div class="mnav"><button data-act="${prev}" aria-label="前">‹</button><div class="cur">${label}</div><button data-act="${next}" aria-label="次">›</button></div>`;
  }
  function monthLabel() { const [y, m] = ui.month.split('-'); return `${y}年${+m}月`; }

  function txRow(t) {
    const c = catOf(t.category, t.type);
    const sub = [t.payee, t.memo].filter(Boolean).join(' / ');
    return `<button class="tx" data-act="edit" data-v="${esc(t.id)}">${icon(c)}<div class="l"><div><b>${esc(t.category)}</b></div><small>${esc(sub || '(名称なし)')}</small></div><div class="r ${t.type === 'income' ? 'inc' : 'exp'}">${t.type === 'income' ? '+' : '-'}${yen(t.amount)}</div></button>`;
  }
  function groupedList(list) {
    const days = [...new Set(list.map(t => t.date))].sort().reverse();
    return days.map(d => {
      const items = list.filter(t => t.date === d);
      const net = items.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0);
      return `<div class="dh"><span>${dayLabel(d)}</span><span>${net < 0 ? '-' : ''}${yen(Math.abs(net))}</span></div>${items.map(txRow).join('')}`;
    }).join('');
  }
  const sortDesc = list => list.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

  // ---------- 入力フォーム ----------
  function gridHtml(type, sel) {
    return state.cats.filter(c => c.type === type).map(c =>
      `<button type="button" class="cat ${c.name === sel ? 'on' : ''}" data-act="pickCat" data-v="${esc(c.name)}"><span class="e">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('');
  }
  function entryForm(t, edit) {
    const sel = state.cats.some(c => c.name === t.category && c.type === t.type) ? t.category : defaultCat(t.type);
    return `<form id="txForm" data-id="${esc(t.id || '')}" data-edit="${edit ? 1 : 0}">
      <input type="hidden" name="type" value="${t.type}"><input type="hidden" name="category" value="${esc(sel)}">
      <div class="frow" style="justify-content:center"><div class="seg"><button type="button" data-act="setType" data-v="expense" class="${t.type === 'expense' ? 'on' : ''}">支出</button><button type="button" data-act="setType" data-v="income" class="${t.type === 'income' ? 'on' : ''}">収入</button></div></div>
      <div class="frow"><span class="fl">日付</span><button type="button" class="step" data-act="dateStep" data-v="-1" aria-label="前の日">‹</button><input type="date" name="date" value="${esc(t.date)}" required><button type="button" class="step" data-act="dateStep" data-v="1" aria-label="次の日">›</button></div>
      <div class="frow"><span class="fl">取引先</span><input name="payee" value="${esc(t.payee)}" placeholder="店名、送金先、受け取り元"></div>
      <div class="frow"><span class="fl">メモ</span><input name="memo" value="${esc(t.memo)}" placeholder="メモ"></div>
      <div class="frow"><span class="fl" id="amtLbl">${t.type === 'income' ? '収入' : '支出'}</span><input class="amt" name="amount" inputmode="numeric" placeholder="0" value="${t.amount || ''}"><span>円</span></div>
      <span class="fl hd">カテゴリー</span><div class="grid" id="catGrid">${gridHtml(t.type, sel)}</div>
      ${edit ? '<label class="chk"><input type="checkbox" name="applyAll"><span>同じ取引先をすべてこのカテゴリにする</span></label>' : ''}
      <button class="primary big" id="subBtn">${edit ? '保存' : (t.type === 'income' ? '収入' : '支出') + 'を入力する'}</button>
      ${edit ? `<div class="row" style="padding:0 16px"><button type="button" data-act="closeSheet">キャンセル</button><button type="button" data-act="delTx" data-v="${esc(t.id)}" class="danger">削除</button></div>` : ''}
    </form>`;
  }

  // ---------- 画面 ----------
  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.tab));
    $('main').innerHTML = { input: viewInput, cal: viewCal, report: viewReport, menu: viewMenu }[ui.tab]();
    window.scrollTo(0, 0);
  }

  function viewInput() {
    return `<div class="top"><b style="margin:0 auto">入力</b><button class="ibtn" data-act="search" aria-label="検索">🔍</button></div>` +
      entryForm({ type: ui.entryType, date: ui.entryDate, amount: '', payee: '', memo: '', category: '' }, false);
  }

  function viewCal() {
    const [y, m] = ui.month.split('-').map(Number);
    const days = Core.dailyTotals(state.txs, ui.month, state.excluded);
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const dim = new Date(y, m, 0).getDate();
    const total = Math.ceil((lead + dim) / 7) * 7;
    let cells = ['月', '火', '水', '木', '金', '土', '日'].map((w, i) => `<div class="wd ${i === 5 ? 'sat' : i === 6 ? 'sun' : ''}">${w}</div>`).join('');
    for (let i = 0; i < total; i++) {
      const d = new Date(y, m - 1, 1 - lead + i), key = fmt(d), inM = d.getMonth() === m - 1, col = i % 7;
      const o = inM ? days[key] : null;
      cells += `<button class="day ${inM ? '' : 'out'} ${ui.calDay === key ? 'sel' : ''}" data-act="calDay" data-v="${key}"><span class="n ${col === 5 ? 'sat' : col === 6 ? 'sun' : ''}">${d.getDate()}</span><span class="v">${o && o.i ? `<span class="inc">${num(o.i)}</span><br>` : ''}${o && o.e ? `<span class="exp">${num(o.e)}</span>` : ''}</span></button>`;
    }
    const s = Core.summarize(state.txs, ui.month, state.excluded), ex = excluded();
    let list = state.txs.filter(t => t.date.startsWith(ui.month) && !ex.has(t.category));
    if (ui.calDay) list = list.filter(t => t.date === ui.calDay);
    sortDesc(list);
    return `<div class="top"><b style="margin:0 auto">カレンダー</b><button class="ibtn" data-act="search" aria-label="検索">🔍</button></div>
      ${monthNav(monthLabel(), 'mPrev', 'mNext')}
      <div class="cal">${cells}</div>
      <div class="sub3"><div><small>収入</small><b class="inc">${yen(s.income)}</b></div><div><small>支出</small><b class="exp">${yen(s.expense)}</b></div><div><small>合計</small><b>${s.balance < 0 ? '-' : ''}${yen(Math.abs(s.balance))}</b></div></div>
      ${ui.calDay ? `<div class="dh"><span>${dayLabel(ui.calDay)}だけ表示中</span><button data-act="calDay" data-v="${ui.calDay}" style="min-height:28px;font-size:13px">全体に戻す</button></div>` : ''}
      <div class="list">${list.length ? groupedList(list) : '<div class="empty">取引がありません</div>'}</div>`;
  }

  function donut(list, total) {
    if (!total) return '<div class="empty">データがありません</div>';
    let acc = 0;
    const segs = list.map(c => {
      const pct = c.amount / total * 100;
      const col = catOf(c.category, ui.repType).color;
      const s = `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${25 - acc}"/>`;
      acc += pct; return s;
    }).join('');
    return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="カテゴリ別の割合"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--line)" stroke-width="7"/>${segs}<text x="21" y="22.5" text-anchor="middle" font-size="3.6" font-weight="700">${num(total)}円</text></svg>`;
  }

  function viewReport() {
    const year = ui.rep === 'year';
    const period = year ? ui.month.slice(0, 4) : ui.month;
    const s = Core.summarize(state.txs, period, state.excluded);
    const isExp = ui.repType === 'expense';
    const list = isExp ? s.byCat : s.byCatIn, total = isExp ? s.expense : s.income;
    const rows = list.map(c => {
      const ct = catOf(c.category, ui.repType);
      return `<button class="rrow ${ui.repCat === c.category ? 'on' : ''}" data-act="repCat" data-v="${esc(c.category)}">${icon(ct)}<span class="nm">${esc(c.category)}</span><span class="am">${yen(c.amount)}</span><span class="pc">${(c.amount / total * 100).toFixed(1)} %</span></button>`;
    }).join('');
    let detail = '';
    if (ui.repCat) {
      const ex = excluded();
      const items = sortDesc(state.txs.filter(t => t.date.startsWith(period) && t.type === ui.repType && t.category === ui.repCat && !ex.has(t.category)));
      detail = `<h2>${esc(ui.repCat)}の取引</h2><div class="list">${groupedList(items)}</div>`;
    }
    let monthly = '';
    if (year) {
      monthly = '<h2>月ごとの収支</h2><div class="list">' + Array.from({ length: 12 }, (_, i) => {
        const mo = period + '-' + pad(i + 1), ms = Core.summarize(state.txs, mo, state.excluded);
        return `<button class="rrow" data-act="goMonth" data-v="${mo}"><span class="nm">${i + 1}月</span><span class="exp am">-${num(ms.expense)}</span><span class="inc am">+${num(ms.income)}</span></button>`;
      }).join('') + '</div>';
    }
    return `<div class="top"><button class="ibtn" style="visibility:hidden">🔍</button><div class="seg"><button data-act="repMode" data-v="month" class="${year ? '' : 'on'}">月間レポート</button><button data-act="repMode" data-v="year" class="${year ? 'on' : ''}">年間レポート</button></div><button class="ibtn" data-act="search" aria-label="検索">🔍</button></div>
      ${monthNav(year ? period + '年' : monthLabel(), 'pPrev', 'pNext')}
      <div class="boxes"><div class="box"><small>支出</small><b class="exp">-${yen(s.expense)}</b></div><div class="box"><small>収入</small><b class="inc">+${yen(s.income)}</b></div><div class="box w"><small>収支</small><b>${s.balance < 0 ? '-' : ''}${yen(Math.abs(s.balance))}</b></div></div>
      <div class="top" style="justify-content:center"><div class="seg"><button data-act="repType" data-v="expense" class="${isExp ? 'on' : ''}">支出</button><button data-act="repType" data-v="income" class="${isExp ? '' : 'on'}">収入</button></div></div>
      <div class="card" style="border:0">${donut(list, total)}</div>
      <div class="list">${rows}</div>${detail}${monthly}`;
  }

  function viewMenu() {
    const names = [...new Set(state.cats.map(c => c.name))];
    const ex = names.map(n => `<label class="chk" style="margin:6px 0"><input type="checkbox" data-act="toggleEx" data-v="${esc(n)}" ${state.excluded.includes(n) ? 'checked' : ''}>${esc(n)}</label>`).join('');
    const rules = state.rules.length ? state.rules.map((r, i) => `<div class="tx" style="min-height:48px"><div class="l"><div>${esc(r.keyword)}</div><small>→ ${esc(r.category)}</small></div><button data-act="rmRule" data-v="${i}" class="danger">削除</button></div>`).join('') : '<div class="muted">まだありません。取引を編集するとき「同じ取引先をすべて」を選ぶと追加されます。</div>';
    return `<div class="top"><b style="margin:0 auto">メニュー</b></div>
      <h2>カテゴリ</h2><div class="card"><div class="row"><button data-act="editCats" data-v="expense">支出カテゴリの編集</button><button data-act="editCats" data-v="income">収入カテゴリの編集</button></div></div>
      <h2>PayPayのCSVを取り込む</h2><div class="card"><p class="muted" style="margin-top:0">PayPayの取引履歴CSVを選びます。同じ取引は2回入りません。チャージ・ポイントは取り込みません。</p><input type="file" id="csvFile" accept=".csv,text/csv"><div id="importResult"></div></div>
      <h2>集計から除外するカテゴリ</h2><div class="card">${ex}</div>
      <h2>自分のカテゴリ規則</h2><div class="list">${rules}</div>
      <h2>バックアップ</h2><div class="card"><p class="muted" style="margin-top:0">Safariはしばらく使わないとデータを消すことがあります。月に1回はJSONを書き出して保存してください。</p>
        <div class="row"><button data-act="exportJson">JSON書き出し</button><button data-act="exportCsv">CSV書き出し</button></div>
        <p class="muted">JSONから復元(現在のデータを置き換えます)</p><input type="file" id="jsonFile" accept=".json,application/json"></div>
      <h2>データ</h2><div class="card"><div class="muted">取引 ${state.txs.length}件</div><button data-act="wipe" class="danger" style="margin-top:8px">すべて削除</button></div>`;
  }

  // ---------- シート ----------
  function openSheet(html) { const s = $('sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }

  function openEdit(id) {
    const t = state.txs.find(x => x.id === id);
    if (t) openSheet(`<h3>取引を編集</h3>${entryForm(t, true)}`);
  }

  function openSearch() {
    openSheet(`<h3>検索</h3><div style="padding:8px 16px;background:var(--card)"><input id="searchQ" placeholder="取引先・メモ・カテゴリ" style="background:var(--bg)"></div><div class="muted" id="searchCount" style="padding:6px 16px"></div><div class="list" id="searchRes"></div><div style="padding:12px 16px"><button data-act="closeSheet" style="width:100%">閉じる</button></div>`);
    $('searchQ').focus();
  }
  function runSearch(q) {
    const r = Core.searchTxs(state.txs, q);
    $('searchCount').textContent = q.trim() ? `${r.length}件` : '';
    $('searchRes').innerHTML = r.slice(0, 100).map(t => `<div class="dh"><span>${dayLabel(t.date)}</span></div>${txRow(t)}`).join('') + (r.length > 100 ? '<div class="empty">先頭100件を表示しています</div>' : '');
  }

  function catEditor() {
    const type = ui.catType;
    const rows = state.cats.filter(c => c.type === type).map(c => `<div class="tx" style="min-height:52px">${icon(c)}<div class="l"><div><b>${esc(c.name)}</b></div></div><button data-act="renameCat" data-v="${esc(c.name)}">名前</button>${c.name === 'その他' ? '' : `<button data-act="delCat" data-v="${esc(c.name)}" class="danger">削除</button>`}</div>`).join('');
    const emo = ICONS.map(e => `<button data-act="pickIcon" data-v="${e}" class="${e === ui.newIcon ? 'on' : ''}">${e}</button>`).join('');
    openSheet(`<h3>${type === 'expense' ? '支出' : '収入'}カテゴリの編集</h3><div class="list">${rows}</div>
      <h2>追加</h2><div class="emo">${emo}</div><div style="padding:8px 16px;display:flex;gap:8px"><input id="newCatName" placeholder="カテゴリ名" style="background:var(--card)"><button class="primary" data-act="addCat">追加</button></div>
      <div style="padding:0 16px"><button data-act="closeSheet" style="width:100%">閉じる</button></div>`);
  }

  // ---------- 操作 ----------
  function saveForm(form) {
    const f = form.elements;
    const amount = parseInt(String(f.amount.value).replace(/[^\d]/g, ''), 10);
    const date = f.date.value, payee = f.payee.value.trim(), memo = f.memo.value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('日付を入力してください');
    if (!(amount > 0)) return toast('金額を入力してください');
    const id = form.dataset.id, edit = form.dataset.edit === '1';
    const old = id ? state.txs.find(x => x.id === id) : null;
    const t = {
      id: id || 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date, type: f.type.value, amount, payee, memo, category: f.category.value, source: old ? old.source : 'manual',
    };
    if (old) Object.assign(old, t); else state.txs.push(t);
    if (edit && f.applyAll && f.applyAll.checked && payee) {
      state.rules = state.rules.filter(r => r.keyword !== payee).concat({ keyword: payee, category: t.category });
      state.txs.forEach(x => { if (x.payee === payee && x.type === t.type) x.category = t.category; });
    }
    save();
    if (edit) { closeSheet(); render(); toast('保存しました'); return; }
    ui.entryType = t.type; ui.entryDate = date; ui.month = date.slice(0, 7);
    render(); toast(`${dayLabel(date)} ${yen(amount)} を追加しました`);
  }

  async function readText(file) {
    const buf = await file.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('shift_jis').decode(buf);
    return text;
  }

  async function importCsv(file) {
    const box = $('importResult');
    try {
      const { records, skipped } = Core.parsePayPay(await readText(file), state.rules);
      const r = Core.mergeImport(state.txs, records);
      state.txs = r.merged; normalize(state); save();
      const sk = Object.entries(skipped).map(([k, v]) => `${esc(k)} ${v}件`).join('、') || 'なし';
      box.innerHTML = `<p><b>取り込み結果</b><br>追加 ${r.added}件 / 重複 ${r.dup}件</p><p class="muted">取り込まなかったもの: ${sk}</p><button class="primary" data-act="tab" data-v="cal">カレンダーを見る</button>`;
      if (records.length) ui.month = records.reduce((m, t) => t.date > m ? t.date : m, '0000').slice(0, 7);
    } catch (e) {
      box.innerHTML = `<p class="danger">取り込めませんでした: ${esc(e.message)}</p>`;
    }
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function restoreJson(file) {
    try {
      const s = JSON.parse(await readText(file));
      if (!s || !Array.isArray(s.txs)) throw new Error('家計簿のバックアップではありません');
      if (!confirm(`現在の${state.txs.length}件を、バックアップの${s.txs.length}件で置き換えます。よろしいですか。`)) return;
      state = normalize(Object.assign(defaults(), s));
      save(); render(); toast('復元しました');
    } catch (e) { toast('復元できませんでした: ' + e.message); }
  }

  function renameCat(oldName, newName) {
    const type = ui.catType;
    if (state.cats.some(c => c.type === type && c.name === newName)) return toast('同じ名前があります');
    state.cats.find(c => c.type === type && c.name === oldName).name = newName;
    state.txs.forEach(t => { if (t.type === type && t.category === oldName) t.category = newName; });
    state.rules.forEach(r => { if (r.category === oldName) r.category = newName; });
    state.excluded = state.excluded.map(n => n === oldName ? newName : n);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (e.target.id === 'sheet') closeSheet(); return; }
    const v = el.dataset.v, form = el.closest('form');
    switch (el.dataset.act) {
      case 'tab': ui.tab = v; render(); break;
      case 'mPrev': ui.month = Core.addMonths(ui.month, -1); ui.calDay = null; render(); break;
      case 'mNext': ui.month = Core.addMonths(ui.month, 1); ui.calDay = null; render(); break;
      case 'pPrev': ui.month = Core.addMonths(ui.month, ui.rep === 'year' ? -12 : -1); ui.repCat = null; render(); break;
      case 'pNext': ui.month = Core.addMonths(ui.month, ui.rep === 'year' ? 12 : 1); ui.repCat = null; render(); break;
      case 'goMonth': ui.month = v; ui.rep = 'month'; ui.repCat = null; render(); break;
      case 'calDay': ui.calDay = ui.calDay === v ? null : v; render(); break;
      case 'repMode': ui.rep = v; ui.repCat = null; render(); break;
      case 'repType': ui.repType = v; ui.repCat = null; render(); break;
      case 'repCat': ui.repCat = ui.repCat === v ? null : v; render(); break;
      case 'search': openSearch(); break;
      case 'edit': closeSheet(); openEdit(v); break;
      case 'closeSheet': closeSheet(); break;
      case 'setType': {
        form.elements.type.value = v;
        form.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        const c = defaultCat(v); form.elements.category.value = c;
        $('catGrid').innerHTML = gridHtml(v, c);
        $('amtLbl').textContent = v === 'income' ? '収入' : '支出';
        if (form.dataset.edit !== '1') $('subBtn').textContent = (v === 'income' ? '収入' : '支出') + 'を入力する';
        break;
      }
      case 'pickCat':
        form.elements.category.value = v;
        form.querySelectorAll('.cat').forEach(b => b.classList.toggle('on', b.dataset.v === v));
        break;
      case 'dateStep': {
        const inp = form.elements.date, [y, m, d] = (inp.value || today()).split('-').map(Number);
        inp.value = fmt(new Date(y, m - 1, d + Number(v)));
        break;
      }
      case 'delTx':
        if (confirm('この取引を削除します。よろしいですか。')) {
          state.txs = state.txs.filter(x => x.id !== v); save(); closeSheet(); render(); toast('削除しました');
        }
        break;
      case 'toggleEx':
        state.excluded = el.checked ? state.excluded.concat(v) : state.excluded.filter(c => c !== v); save(); break;
      case 'rmRule': state.rules.splice(+v, 1); save(); render(); break;
      case 'editCats': ui.catType = v; catEditor(); break;
      case 'pickIcon': ui.newIcon = v; catEditor(); break;
      case 'addCat': {
        const name = $('newCatName').value.trim();
        if (!name) return toast('カテゴリ名を入力してください');
        if (state.cats.some(c => c.type === ui.catType && c.name === name)) return toast('同じ名前があります');
        state.cats.push({ name, type: ui.catType, icon: ui.newIcon, color: PALETTE[state.cats.length % PALETTE.length] });
        save(); catEditor(); break;
      }
      case 'renameCat': {
        const n = (prompt('新しい名前', v) || '').trim();
        if (n && n !== v) { renameCat(v, n); save(); catEditor(); }
        break;
      }
      case 'delCat': {
        const used = state.txs.filter(t => t.type === ui.catType && t.category === v).length;
        if (confirm(`「${v}」を削除します。${used ? `この分類の${used}件は「その他」に移します。` : ''}よろしいですか。`)) {
          state.txs.forEach(t => { if (t.type === ui.catType && t.category === v) t.category = 'その他'; });
          state.cats = state.cats.filter(c => !(c.type === ui.catType && c.name === v));
          state.rules = state.rules.filter(r => r.category !== v);
          save(); catEditor();
        }
        break;
      }
      case 'exportJson': download('kakeibo-backup-' + today() + '.json', JSON.stringify(state), 'application/json'); break;
      case 'exportCsv': download('kakeibo-' + today() + '.csv', Core.toCsv(state.txs), 'text/csv'); break;
      case 'wipe':
        if (confirm(`取引${state.txs.length}件とカテゴリ設定をすべて削除します。元に戻せません。よろしいですか。`)) {
          state = defaults(); save(); render(); toast('削除しました');
        }
        break;
    }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'txForm') { e.preventDefault(); saveForm(e.target); } });
  document.addEventListener('input', e => { if (e.target.id === 'searchQ') runSearch(e.target.value); });
  document.addEventListener('change', e => {
    const t = e.target;
    const f = t.files && t.files[0];
    if (!f) return;
    if (t.id === 'csvFile') importCsv(f);
    if (t.id === 'jsonFile') restoreJson(f);
  });

  // 横スワイプで月送り(カレンダー・レポート)。左へ=次、右へ=前。縦スクロール優先。
  let sw = null;
  const mainEl = $('main');
  mainEl.addEventListener('touchstart', e => {
    sw = (ui.tab === 'cal' || ui.tab === 'report') && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  mainEl.addEventListener('touchend', e => {
    if (!sw) return;
    const t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    swipeMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
  function swipeMonth(dir) {
    if (ui.tab === 'cal') { ui.month = Core.addMonths(ui.month, dir); ui.calDay = null; }
    else { ui.month = Core.addMonths(ui.month, dir * (ui.rep === 'year' ? 12 : 1)); ui.repCat = null; }
    render();
  }
  window.__swipeMonth = swipeMonth; // テスト用

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン対応なしで動作 */ });
  }
  render();
})();
