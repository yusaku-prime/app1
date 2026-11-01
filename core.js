// 家計簿PWA: CSV解析・分類・集計の中核ロジック(画面に依存しない)
(function (root) {
  'use strict';

  const CATEGORIES = ['外食', 'コンビニ', '遊び', '衣服', '日用品', '美容', '交通', 'サブスク・通信', '送金', 'カード引落', '収入', 'その他'];

  // 取引先名に含まれるキーワード → カテゴリ(先に一致したものを採用)
  const DEFAULT_RULES = [
    ['PayPayカード', 'カード引落'],
    ['ファミリーマート', 'コンビニ'], ['セブン', 'コンビニ'], ['ローソン', 'コンビニ'], ['NewDays', 'コンビニ'], ['ミニストップ', 'コンビニ'],
    ['Apple', 'サブスク・通信'], ['Netflix', 'サブスク・通信'], ['Spotify', 'サブスク・通信'], ['Google', 'サブスク・通信'],
    ['カラオケ', '遊び'], ['まねきねこ', '遊び'], ['歌広場', '遊び'], ['ビッグエコー', '遊び'], ['Darts', '遊び'], ['ZINO', '遊び'],
    ['快活CLUB', '遊び'], ['すさび湯', '遊び'], ['湯楽', '遊び'], ['サウナ', '遊び'], ['温泉', '遊び'], ['ゲーム', '遊び'],
    ['ユニクロ', '衣服'], ['アディダス', '衣服'], ['GU', '衣服'],
    ['イオン', '日用品'], ['ドラッグ', '日用品'], ['ダイソー', '日用品'], ['アルカキット', '日用品'],
    ['HAIR', '美容'], ['美容', '美容'], ['ヘア', '美容'],
    ['JR', '交通'], ['Suica', '交通'], ['タクシー', '交通'], ['メトロ', '交通'],
    ['居酒屋', '外食'], ['酒場', '外食'], ['酒陣', '外食'], ['焼', '外食'], ['やきとん', '外食'], ['寿司', '外食'], ['すし', '外食'],
    ['餃子', '外食'], ['うなぎ', '外食'], ['ひつまぶし', '外食'], ['鳥貴族', '外食'], ['酔っ手羽', '外食'], ['とりいちず', '外食'],
    ['漁港', '外食'], ['トロ政', '外食'], ['新時代', '外食'], ['塚田農場', '外食'], ['併呑', '外食'], ['いっちょかみ', '外食'],
    ['ラーメン', '外食'], ['カフェ', '外食'], ['珈琲', '外食'], ['マクドナルド', '外食'], ['吉野家', '外食'], ['すき家', '外食'],
  ];

  const TYPE_MAP = { '支払い': 'expense', '請求書払い': 'expense', '送った金額': 'expense', '受け取った金額': 'income' };

  // RFC4180風のCSV解析(引用符内のカンマ・改行・""に対応)
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }

  function toInt(s) {
    s = String(s == null ? '' : s).replace(/[,\s円]/g, '');
    return /^\d+$/.test(s) ? parseInt(s, 10) : 0;
  }

  function categorize(payee, rules) {
    const list = (rules || []).map(r => [r.keyword, r.category]).concat(DEFAULT_RULES);
    for (const [kw, cat] of list) if (kw && payee.includes(kw)) return cat;
    return 'その他';
  }

  // PayPayのCSV → {records, skipped:{取引内容:件数}}
  function parsePayPay(text, rules) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSVが空です');
    const h = rows[0].map(s => s.trim());
    const ix = n => h.indexOf(n);
    const iDate = ix('取引日'), iOut = ix('出金金額（円）'), iIn = ix('入金金額（円）');
    const iType = ix('取引内容'), iPayee = ix('取引先'), iNo = ix('取引番号');
    if ([iDate, iOut, iIn, iType, iPayee, iNo].some(i => i < 0)) throw new Error('PayPayの取引履歴CSVではありません');
    const records = [], skipped = {};
    for (const r of rows.slice(1)) {
      const kind = TYPE_MAP[r[iType]];
      const amount = kind === 'income' ? toInt(r[iIn]) : toInt(r[iOut]);
      if (!kind || amount <= 0) { skipped[r[iType]] = (skipped[r[iType]] || 0) + 1; continue; }
      const payee = (r[iPayee] || '').trim();
      const category = r[iType] === '送った金額' ? '送金' : kind === 'income' ? '収入' : categorize(payee, rules);
      records.push({
        id: 'pp-' + r[iNo], date: r[iDate].slice(0, 10).replace(/\//g, '-'),
        type: kind, amount, payee, memo: '', category, source: 'paypay',
      });
    }
    return { records, skipped };
  }

  // 既存データに追加(idが同じものは重複として無視)
  function mergeImport(existing, incoming) {
    const seen = new Set(existing.map(t => t.id));
    const added = [];
    let dup = 0;
    for (const t of incoming) { if (seen.has(t.id)) dup++; else { seen.add(t.id); added.push(t); } }
    return { merged: existing.concat(added), added: added.length, dup };
  }

  function summarize(txs, month, excluded) {
    const ex = new Set(excluded || []);
    let expense = 0, income = 0;
    const by = {};
    for (const t of txs) {
      if (!t.date.startsWith(month) || ex.has(t.category)) continue;
      if (t.type === 'income') income += t.amount;
      else { expense += t.amount; by[t.category] = (by[t.category] || 0) + t.amount; }
    }
    const byCat = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
    return { expense, income, balance: income - expense, byCat };
  }

  function addMonths(month, d) {
    let [y, m] = month.split('-').map(Number);
    m += d - 1; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12 + 1;
    return y + '-' + String(m).padStart(2, '0');
  }

  function monthlyExpense(txs, endMonth, n, excluded) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const month = addMonths(endMonth, -i);
      out.push({ month, expense: summarize(txs, month, excluded).expense });
    }
    return out;
  }

  function toCsv(txs) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = ['日付,収支,金額,取引先,メモ,カテゴリ'];
    for (const t of txs.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) {
      lines.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount, q(t.payee), q(t.memo), t.category].join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  root.Core = { CATEGORIES, DEFAULT_RULES, parseCsv, parsePayPay, categorize, mergeImport, summarize, addMonths, monthlyExpense, toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
