// 家計簿PWA: CSV解析・分類・集計の中核ロジック(画面に依存しない)
(function (root) {
  'use strict';

  // 初期カテゴリ(名前 + 種別ごとに一意)
  const DEFAULT_CATS = [
    { name: '食費', type: 'expense', icon: '🍽️', color: '#f08c2e' },
    { name: '衣服', type: 'expense', icon: '👕', color: '#2a3ea0' },
    { name: '教育費', type: 'expense', icon: '📚', color: '#e04a5f' },
    { name: '交通費', type: 'expense', icon: '🚃', color: '#a0522d' },
    { name: '遊び', type: 'expense', icon: '🎮', color: '#f2c94c' },
    { name: 'その他', type: 'expense', icon: '⭐', color: '#3aa0e8' },
    { name: 'カフェ', type: 'expense', icon: '🍰', color: '#f6d86b' },
    { name: 'ガソリン', type: 'expense', icon: '⛽', color: '#c2185b' },
    { name: '駐輪場', type: 'expense', icon: '🚲', color: '#e53935' },
    { name: '風呂', type: 'expense', icon: '♨️', color: '#43a047' },
    { name: '美容', type: 'expense', icon: '💄', color: '#a61e63' },
    { name: '飲み', type: 'expense', icon: '🍷', color: '#e5c100' },
    { name: '賭け', type: 'expense', icon: '🎰', color: '#d4a017' },
    { name: '旅行', type: 'expense', icon: '✈️', color: '#e53935' },
    { name: 'コンビニ', type: 'expense', icon: '🛒', color: '#8e5cf0' },
    { name: '送金', type: 'expense', icon: '💸', color: '#607d8b' },
    { name: 'カード引落', type: 'expense', icon: '💳', color: '#78909c' },
    { name: '給料', type: 'income', icon: '💴', color: '#1f7a5a' },
    { name: '受取', type: 'income', icon: '🎁', color: '#3aa0e8' },
    { name: 'その他', type: 'income', icon: '⭐', color: '#7f8c8d' },
  ];

  // 取引先名に含まれるキーワード → カテゴリ(先に一致したものを採用)
  const DEFAULT_RULES = [
    ['PayPayカード', 'カード引落'],
    ['ファミリーマート', 'コンビニ'], ['セブン', 'コンビニ'], ['ローソン', 'コンビニ'], ['NewDays', 'コンビニ'], ['ミニストップ', 'コンビニ'],
    ['カラオケ', '遊び'], ['まねきねこ', '遊び'], ['歌広場', '遊び'], ['ビッグエコー', '遊び'], ['第一興商', '遊び'], ['Darts', '遊び'], ['ZINO', '遊び'],
    ['快活CLUB', '遊び'], ['ゲーム', '遊び'],
    ['すさび湯', '風呂'], ['湯楽', '風呂'], ['サウナ', '風呂'], ['温泉', '風呂'], ['銭湯', '風呂'],
    ['ユニクロ', '衣服'], ['アディダス', '衣服'],
    ['HAIR', '美容'], ['美容', '美容'], ['ヘア', '美容'], ['理容', '美容'],
    ['JR', '交通費'], ['Suica', '交通費'], ['タクシー', '交通費'], ['メトロ', '交通費'],
    ['ENEOS', 'ガソリン'], ['エネオス', 'ガソリン'], ['出光', 'ガソリン'], ['ガソリン', 'ガソリン'],
    ['駐輪', '駐輪場'],
    ['カフェ', 'カフェ'], ['珈琲', 'カフェ'], ['コーヒー', 'カフェ'], ['スターバックス', 'カフェ'], ['ドトール', 'カフェ'],
    ['居酒屋', '飲み'], ['酒', '飲み'], ['やきとん', '飲み'], ['鳥貴族', '飲み'], ['酔っ手羽', '飲み'], ['とりいちず', '飲み'],
    ['塚田農場', '飲み'], ['併呑', '飲み'], ['いっちょかみ', '飲み'], ['焼鳥', '飲み'],
    ['寿司', '食費'], ['すし', '食費'], ['餃子', '食費'], ['うなぎ', '食費'], ['ひつまぶし', '食費'], ['漁港', '食費'], ['トロ政', '食費'],
    ['新時代', '食費'], ['ラーメン', '食費'], ['マクドナルド', '食費'], ['吉野家', '食費'], ['すき家', '食費'], ['イオン', '食費'],
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
      const category = r[iType] === '送った金額' ? '送金' : kind === 'income' ? '受取' : categorize(payee, rules);
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

  // period は 'YYYY-MM'(月)または 'YYYY'(年)
  function summarize(txs, period, excluded) {
    const ex = new Set(excluded || []);
    let expense = 0, income = 0;
    const by = {}, byIn = {};
    for (const t of txs) {
      if (!t.date.startsWith(period) || ex.has(t.category)) continue;
      if (t.type === 'income') { income += t.amount; byIn[t.category] = (byIn[t.category] || 0) + t.amount; }
      else { expense += t.amount; by[t.category] = (by[t.category] || 0) + t.amount; }
    }
    const list = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
    return { expense, income, balance: income - expense, byCat: list(by), byCatIn: list(byIn) };
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

  // 日付ごとの収支 {YYYY-MM-DD: {e, i}}
  function dailyTotals(txs, month, excluded) {
    const ex = new Set(excluded || []);
    const days = {};
    for (const t of txs) {
      if (!t.date.startsWith(month) || ex.has(t.category)) continue;
      const o = days[t.date] || (days[t.date] = { e: 0, i: 0 });
      if (t.type === 'income') o.i += t.amount; else o.e += t.amount;
    }
    return days;
  }

  function searchTxs(txs, q) {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return txs.filter(t => {
      const s = (t.payee + ' ' + t.memo + ' ' + t.category).toLowerCase();
      return words.every(w => s.includes(w));
    }).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  }

  function toCsv(txs) {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = ['日付,収支,金額,取引先,メモ,カテゴリ'];
    for (const t of txs.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) {
      lines.push([t.date, t.type === 'income' ? '収入' : '支出', t.amount, q(t.payee), q(t.memo), t.category].join(','));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  root.Core = { DEFAULT_CATS, DEFAULT_RULES, parseCsv, parsePayPay, categorize, mergeImport, summarize, addMonths, monthlyExpense, dailyTotals, searchTxs, toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
