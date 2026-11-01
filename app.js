// 家計簿PWA: 画面と保存
(function () {
  'use strict';
  const KEY = 'kakeibo-v1';
  const $ = id => document.getElementById(id);
  const yen = n => Number(n).toLocaleString('ja-JP') + '円';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function pad(n) { return String(n).padStart(2, '0'); }
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function load() {
    const base = { txs: [], rules: [], excluded: ['カード引落'] };
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.txs)) return Object.assign(base, s);
    } catch (e) { /* 保存領域が使えない場合は空で開始 */ }
    return base;
  }
  let state = load();
  let ui = { tab: 'month', month: today().slice(0, 7), cat: null };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('保存できませんでした(容量不足またはプライベートモード)'); }
  }
  let tt;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 3500);
  }

  // ---------- 描画 ----------
  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === ui.tab));
    $('main').innerHTML = { month: viewMonth, add: viewAdd, import: viewImport, settings: viewSettings }[ui.tab]();
    window.scrollTo(0, 0);
  }

  function viewMonth() {
    const sum = Core.summarize(state.txs, ui.month, state.excluded);
    const ex = new Set(state.excluded);
    const [y, m] = ui.month.split('-');
    const trend = Core.monthlyExpense(state.txs, ui.month, 12, state.excluded);
    const max = Math.max(1, ...trend.map(t => t.expense));
    let list = state.txs.filter(t => t.date.startsWith(ui.month) && !ex.has(t.category));
    if (ui.cat) list = list.filter(t => t.category === ui.cat);
    list.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    const topExp = sum.byCat.length ? sum.byCat[0].amount : 1;
    return `
      <div class="mnav"><button data-act="prevM" aria-label="前の月">‹</button><b>${y}年${+m}月</b><button data-act="nextM" aria-label="次の月">›</button></div>
      <div class="sums">
        <div><small>支出</small><b class="exp">${yen(sum.expense)}</b></div>
        <div><small>収入</small><b class="inc">${yen(sum.income)}</b></div>
        <div><small>差額</small><b>${sum.balance < 0 ? '-' : ''}${yen(Math.abs(sum.balance))}</b></div>
      </div>
      <h2>直近12か月の支出</h2>
      <div class="card"><div class="trend">${trend.map(t => `<button data-act="pickM" data-v="${t.month}" class="${t.month === ui.month ? 'on' : ''}" aria-label="${t.month} ${yen(t.expense)}"><i style="height:${Math.round(t.expense / max * 70)}px"></i>${+t.month.slice(5)}</button>`).join('')}</div></div>
      <h2>カテゴリ別の支出${ui.cat ? '(絞り込み中)' : ''}</h2>
      <div class="card">${sum.byCat.length ? sum.byCat.map(c => `<button class="crow ${ui.cat === c.category ? 'on' : ''}" data-act="filterCat" data-v="${esc(c.category)}"><div class="t"><span>${esc(c.category)}</span><span>${yen(c.amount)}(${Math.round(c.amount / sum.expense * 100)}%)</span></div><div class="b"><i style="width:${Math.round(c.amount / topExp * 100)}%"></i></div></button>`).join('') : '<div class="empty">この月の支出はありません</div>'}</div>
      <h2>取引(${list.length}件)${ui.cat ? ` <button data-act="clearCat" style="min-height:32px;font-size:13px">絞り込み解除</button>` : ''}</h2>
      <div class="card">${list.length ? list.map(txRow).join('') : '<div class="empty">取引がありません</div>'}</div>`;
  }

  function txRow(t) {
    const title = t.payee || t.memo || '(名称なし)';
    return `<button class="tx" data-act="edit" data-v="${esc(t.id)}"><div class="l"><div>${esc(title)}</div><small>${t.date.slice(5).replace('-', '/')}<span class="chip">${esc(t.category)}</span>${t.payee && t.memo ? ' ' + esc(t.memo) : ''}</small></div><div class="r ${t.type === 'income' ? 'inc' : 'exp'}">${t.type === 'income' ? '+' : '-'}${yen(t.amount)}</div></button>`;
  }

  function formHtml(t) {
    const cats = Core.CATEGORIES.map(c => `<option ${t.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('');
    return `
      <label>収支</label>
      <select name="type"><option value="expense" ${t.type !== 'income' ? 'selected' : ''}>支出</option><option value="income" ${t.type === 'income' ? 'selected' : ''}>収入</option></select>
      <div class="row"><div><label>日付</label><input type="date" name="date" value="${esc(t.date)}" required></div>
      <div><label>金額(円)</label><input name="amount" inputmode="numeric" pattern="[0-9,]*" value="${t.amount || ''}" placeholder="0" required></div></div>
      <label>取引先</label><input name="payee" value="${esc(t.payee)}" placeholder="店名、送金先、受け取り元">
      <label>メモ</label><input name="memo" value="${esc(t.memo)}" placeholder="メモ">
      <label>カテゴリ</label><select name="category">${cats}</select>`;
  }

  function viewAdd() {
    return `<h2>手入力で追加</h2><form id="txForm" class="card" data-id="">${formHtml({ date: today(), type: 'expense', amount: '', payee: '', memo: '', category: 'その他' })}
      <div style="margin-top:16px"><button class="primary" style="width:100%">追加する</button></div></form>`;
  }

  function viewImport() {
    return `<h2>PayPayのCSVを取り込む</h2>
      <div class="card"><p class="muted" style="margin-top:0">PayPayアプリの取引履歴からCSVを書き出し、ここで選びます。同じ取引は2回入りません。チャージ・ポイントは支出ではないので取り込みません。</p>
      <label for="csvFile">CSVファイル</label><input type="file" id="csvFile" accept=".csv,text/csv"></div>
      <div id="importResult"></div>`;
  }

  function viewSettings() {
    const cats = Core.CATEGORIES.map(c => `<label class="chk"><input type="checkbox" data-act="toggleEx" data-v="${esc(c)}" ${state.excluded.includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('');
    const rules = state.rules.length ? state.rules.map((r, i) => `<div class="tx" style="min-height:48px;align-items:center"><div class="l"><div>${esc(r.keyword)}</div><small>→ ${esc(r.category)}</small></div><button data-act="rmRule" data-v="${i}" class="danger">削除</button></div>`).join('') : '<div class="muted">まだありません。取引のカテゴリを変えるときに「同じ取引先すべて」を選ぶと追加されます。</div>';
    return `<h2>集計から除外するカテゴリ</h2><div class="card">${cats}<div class="muted">カード引落は、カード明細と二重になるため初期設定で除外です。</div></div>
      <h2>自分のカテゴリ規則</h2><div class="card">${rules}</div>
      <h2>バックアップ</h2><div class="card">
        <p class="muted" style="margin-top:0">Safariはしばらく使わないとデータを消すことがあります。月に1回はJSONを書き出して保存してください。</p>
        <div class="row"><button data-act="exportJson">JSON書き出し</button><button data-act="exportCsv">CSV書き出し</button></div>
        <label for="jsonFile">JSONから復元(現在のデータを置き換えます)</label><input type="file" id="jsonFile" accept=".json,application/json">
      </div>
      <h2>データ</h2><div class="card"><div class="muted">取引 ${state.txs.length}件</div><button data-act="wipe" class="danger" style="margin-top:8px">すべて削除</button></div>`;
  }

  // ---------- 操作 ----------
  function openSheet(html) { const s = $('sheet'); s.innerHTML = `<div class="in">${html}</div>`; s.hidden = false; }
  function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; }

  function openEdit(id) {
    const t = state.txs.find(x => x.id === id);
    if (!t) return;
    openSheet(`<h2 style="margin-top:0">取引を編集</h2><form id="txForm" data-id="${esc(id)}">${formHtml(t)}
      <label class="chk"><input type="checkbox" name="applyAll" style="width:22px"><span>同じ取引先をすべてこのカテゴリにする</span></label>
      <div class="row"><button type="button" data-act="closeSheet">キャンセル</button><button class="primary">保存</button></div>
      <button type="button" data-act="delTx" data-v="${esc(id)}" class="danger" style="width:100%;margin-top:12px">この取引を削除</button></form>`);
  }

  function saveForm(form) {
    const d = new FormData(form);
    const amount = parseInt(String(d.get('amount')).replace(/[^\d]/g, ''), 10);
    const date = String(d.get('date'));
    const payee = String(d.get('payee')).trim(), memo = String(d.get('memo')).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('日付を入力してください');
    if (!(amount > 0)) return toast('金額を入力してください');
    if (!payee && !memo) return toast('取引先かメモを入力してください');
    const id = form.dataset.id;
    const old = id ? state.txs.find(x => x.id === id) : null;
    const t = {
      id: id || 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      date, type: d.get('type'), amount, payee, memo, category: d.get('category'),
      source: old ? old.source : 'manual',
    };
    if (old) Object.assign(old, t); else state.txs.push(t);
    if (d.get('applyAll') && payee) {
      state.rules = state.rules.filter(r => r.keyword !== payee).concat({ keyword: payee, category: t.category });
      state.txs.forEach(x => { if (x.payee === payee) x.category = t.category; });
    }
    save(); closeSheet();
    ui.month = date.slice(0, 7); ui.cat = null; ui.tab = 'month';
    render(); toast(old ? '保存しました' : '追加しました');
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
      state.txs = r.merged; save();
      const sk = Object.entries(skipped).map(([k, v]) => `${esc(k)} ${v}件`).join('、') || 'なし';
      box.innerHTML = `<div class="card"><b>取り込み結果</b><p>追加 ${r.added}件 / 重複 ${r.dup}件</p><p class="muted">取り込まなかったもの: ${sk}</p><button class="primary" data-act="tab" data-v="month">月別を見る</button></div>`;
      if (records.length) ui.month = records.reduce((m, t) => t.date > m ? t.date : m, '0000').slice(0, 7);
    } catch (e) {
      box.innerHTML = `<div class="card danger">取り込めませんでした: ${esc(e.message)}</div>`;
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
      state = Object.assign({ txs: [], rules: [], excluded: ['カード引落'] }, s);
      save(); render(); toast('復元しました');
    } catch (e) { toast('復元できませんでした: ' + e.message); }
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) { if (e.target.id === 'sheet') closeSheet(); return; }
    const v = el.dataset.v;
    switch (el.dataset.act) {
      case 'tab': ui.tab = v; render(); break;
      case 'prevM': ui.month = Core.addMonths(ui.month, -1); ui.cat = null; render(); break;
      case 'nextM': ui.month = Core.addMonths(ui.month, 1); ui.cat = null; render(); break;
      case 'pickM': ui.month = v; ui.cat = null; render(); break;
      case 'filterCat': ui.cat = ui.cat === v ? null : v; render(); break;
      case 'clearCat': ui.cat = null; render(); break;
      case 'edit': openEdit(v); break;
      case 'closeSheet': closeSheet(); break;
      case 'delTx':
        if (confirm('この取引を削除します。よろしいですか。')) {
          state.txs = state.txs.filter(x => x.id !== v); save(); closeSheet(); render(); toast('削除しました');
        }
        break;
      case 'toggleEx':
        state.excluded = el.checked ? state.excluded.concat(v) : state.excluded.filter(c => c !== v); save(); break;
      case 'rmRule': state.rules.splice(+v, 1); save(); render(); break;
      case 'exportJson': download('kakeibo-backup-' + today() + '.json', JSON.stringify(state), 'application/json'); break;
      case 'exportCsv': download('kakeibo-' + today() + '.csv', Core.toCsv(state.txs), 'text/csv'); break;
      case 'wipe':
        if (confirm(`取引${state.txs.length}件とカテゴリ規則をすべて削除します。元に戻せません。よろしいですか。`)) {
          state = { txs: [], rules: [], excluded: ['カード引落'] }; save(); render(); toast('削除しました');
        }
        break;
    }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'txForm') { e.preventDefault(); saveForm(e.target); } });
  document.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (e.target.id === 'csvFile') importCsv(f);
    if (e.target.id === 'jsonFile') restoreJson(f);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン対応なしで動作 */ });
  }
  render();
})();
