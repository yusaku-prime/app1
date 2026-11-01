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

  // 取引先名に含まれるキーワード → カテゴリ。上のグループほど優先(先に一致したものを採用)。
  // 照合は全角/半角・大文字小文字を区別しない(NFKC正規化+小文字化)。
  // 他の語に紛れやすい短い語(ana、his、toto、ロト、市場、サイクル、コスモ、バー等)は誤分類を避けるため入れていない。
  // 該当するカテゴリがない店(ドラッグストア・100均・雑貨・家電・モール・公共料金など)は「その他」のまま。
  const G = (cat, words) => words.map(w => [w, cat]);
  const DEFAULT_RULES = [].concat(
    G('カード引落', ['PayPayカード', 'カード請求', 'ご利用代金']),
    // ネット・通信サービスは該当カテゴリがないため「その他」に固定(海外利用の「旅行」扱いにしない)
    G('その他', ['Netflix', 'ネットフリックス', 'Amazon', 'アマゾン', 'Anthropic', 'Claude', 'OpenAI', 'ChatGPT', 'GitHub', 'Google', 'appleサービス', 'apple.com',
      'itunes', 'app store', 'Microsoft', 'Spotify', 'Adobe', 'Dropbox', 'YouTube', 'IIJ', 'NTT', 'ドコモ', 'ソフトバンク', '楽天モバイル']),
    G('賭け', ['JRA', 'ウインズ', 'WINS', '馬券', '競馬', '競輪', '競艇', 'ボートレース', 'オートレース', 'オッズパーク', 'SPAT4', 'UMACA',
      'パチンコ', 'パチスロ', 'スロット', 'マルハン', 'ダイナム', 'ガイア', 'ベラジョン', 'カジノ', 'ナンバーズ', '宝くじ', '麻雀', '雀荘']),
    G('ガソリン', ['ENEOS', 'エネオス', '出光', 'idemitsu', 'コスモ石油', '昭和シェル', 'シェルセルフ', 'apollostation', 'アポロステーション',
      'ガソリン', '洗車', 'JA-SS', 'セルフ給油']),
    G('駐輪場', ['駐輪', '自転車駐車', 'サイクルポート', 'バイク駐車']),
    // コンビニ内のATM手数料などは、コンビニ扱いにしない
    G('その他', ['セブン銀行', 'イーネット', 'ローソン銀行']),
    G('コンビニ', ['ファミリーマート', 'ファミマ', 'セブン-イレブン', 'セブンイレブン', 'セブン', 'ローソン', 'ミニストップ', 'NewDays', 'ニューデイズ',
      'デイリーヤマザキ', 'ヤマザキデイリー', 'ポプラ', 'セイコーマート', 'スリーエフ', 'コンビニ', 'ミニスーパー', 'キオスク',
      '7-eleven', 'gs25', 'gs 25', 'emart24', 'ssiyu', 'familymart', 'lawson']),
    G('遊び', ['カラオケ', 'まねきねこ', '歌広場', 'ビッグエコー', '第一興商', 'ジョイサウンド', 'シダックス', 'BanBan', 'ネットカフェ', 'ネカフェ',
      'マンガ喫茶', '漫画喫茶', '快活CLUB', '快活クラブ', '自遊空間', 'ダーツ', 'Darts', 'ZINO', 'ラウンドワン', 'ROUND1', 'アドアーズ', 'GiGO', 'ゲームセンター',
      'ゲーセン', 'タイトーステーション', 'セガ', 'ナムコ', 'namco', 'ボウリング', 'ビリヤード', '卓球', 'スポッチャ', 'バッティング', 'ゴルフ', 'テニス',
      'フットサル', 'ボルダリング', 'スケート', 'スキー', 'スノーボード', 'キャンプ', 'モンベル', 'ヨガ', 'スポーツ', 'ゼビオ', 'アルペン',
      'エニタイム', 'カーブス', 'ゴールドジム', 'チョコザップ', 'chocozap', 'RIZAP', 'ライザップ', 'ジム',
      '映画', 'シネマ', 'シアター', 'TOHO', 'ユナイテッド・シネマ', 'ムービックス', 'ワーナー・マイカル', '劇団', 'ミュージカル', '歌舞伎座', '東京ドーム', '武道館',
      'コンサート', 'ライブハウス', 'Zepp', 'ぴあ', 'イープラス', 'ローチケ', 'チケット', 'フェス', 'ディズニー', 'ユニバーサル', 'USJ', '遊園地', '水族館',
      '動物園', '博物館', '美術館', 'プラネタリウム', 'テーマパーク', 'サンリオ', 'ゲーム', 'Steam', 'PlayStation', 'プレイステーション', 'Nintendo', 'ニンテンドー', 'Xbox',
      'TSUTAYA', 'ツタヤ', 'ゲオ', 'ペアーズ', 'タップル', 'tinder', '占い', 'karaoke', 'noraebang',
      'スワローズ', 'ジャイアンツ', 'タイガース', 'ベイスターズ', 'カープ', 'ドラゴンズ', 'ライオンズ', 'イーグルス', 'ホークス', 'ファイターズ', 'マリーンズ', 'バファローズ']),
    G('旅行', ['ホテル', 'hotel', 'リゾート', '東横inn', '旅館', '民宿', 'ゲストハウス', '東横イン', 'ルートイン', 'アパホテル', 'スーパーホテル', 'ドーミーイン', 'ヒルトン', 'マリオット',
      '楽天トラベル', 'じゃらん', '一休', 'Booking.com', 'Agoda', 'エクスペディア', 'Expedia', 'Airbnb', 'トリバゴ', 'JAL', '日本航空', '全日空', '全日本空輸',
      'Peach Aviation', 'ジェットスター', 'Jetstar', 'スカイマーク', 'エアドゥ', 'ソラシド', 'フジドリーム', 'スプリング・ジャパン', '春秋航空', 'Aviation', '航空', 'エアライン',
      'airlines', '空港', '旅行', 'ツアー', 'ツーリスト', 'JTB', '阪急交通社', 'クラブツーリズム', 'トラベル', '観光', '新幹線', 'フェリー', '乗船', 'kkday', 'klook', 'trip.com']),
    G('風呂', ['すさび湯', '湯楽', 'サウナ', '温泉', '銭湯', '健康ランド', '岩盤浴', 'onsen', '竜泉寺', '極楽湯', 'ととのう', '湯']),
    G('美容', ['HAIR', 'ヘア', '美容', '理容', '床屋', 'barber', 'バーバー', 'サロン', 'salon', 'ネイル', 'nail', 'エステ', 'まつげ', 'まつ毛', 'アイラッシュ',
      '脱毛', 'ミュゼ', 'TBC', '銀座カラー', 'QBハウス', 'ビューティー', 'beauty', '整体', 'マッサージ', 'リラク', 'アロマ', 'リンパ',
      '鍼灸', '接骨', 'ラクゼ', 'もみほぐし', '整骨', 'カイロ', 'olive young', 'oliveyoung']),
    G('衣服', ['ユニクロ', 'UNIQLO', 'ジーユー', 'gu - ', 'しまむら', 'アディダス', 'adidas', 'ナイキ', 'nike', 'ニューバランス', 'new balance', 'プーマ', 'puma',
      'アシックス', 'ZARA', 'H&M', 'ギャップ', 'ワークマン', '洋服の青山', 'AOKI', 'コナカ', 'はるやま', 'ライトオン', 'ABC-MART', 'ABCマート', 'ビームス', 'BEAMS',
      'ユナイテッドアローズ', 'アーバンリサーチ', 'シップス', 'アースミュージック', 'ローリーズ', 'ZOZO', 'ゾゾタウン', 'WEGO', 'フリークスストア', "FREAK'S", 'ラコステ',
      'セカンドストリート', '2nd STREET', 'セカスト', 'トレファクスタイル', '古着', '洋服', '衣料', 'アパレル', 'ファッション', 'シューズ', '靴', 'メガネ', '眼鏡', 'JINS',
      'Zoff', 'ハニーズ']),
    G('教育費', ['学習塾', '個別指導', '進学', '予備校', '英会話', 'ベルリッツ', '公文', '学院', '大学', '学校', '受験', '検定', '資格', 'TOEIC', '試験',
      '運転免許', '免許', '自動車学校', '教習所', 'Udemy', 'Schoo', 'スタディサプリ', 'Progate', 'ドットインストール', 'paiza', '進研ゼミ', 'Z会', '受講', '講座',
      'セミナー', '研修', 'スクール', '教室', 'レッスン', '書店', '紀伊國屋', '丸善', 'ジュンク堂', '蔦屋書店', '三省堂', '有隣堂', 'ブックファースト', '文教堂', '教材']),
    G('カフェ', ['スターバックス', 'スタバ', 'ドトール', 'タリーズ', 'コメダ', '珈琲', 'コーヒー', 'カフェ', 'cafe', 'coffee', 'サンマルク', 'ベローチェ', 'エクセルシオール',
      'プロント', '上島珈琲', '星乃珈琲', 'ミスタードーナツ', 'ミスド', 'クリスピー', 'サーティワン', 'ハーゲンダッツ', 'ゴンチャ', '喫茶', 'ケーキ', 'パティスリー',
      '洋菓子', '和菓子', 'クレープ', 'タピオカ', 'スイーツ', 'ソフトクリーム', 'アイスクリーム', 'ミルク', '茶房', '茶屋', '茶々工房', '抹茶', 'ドーナツ', 'パンケーキ',
      'ジューススタンド', 'ベーカリー', 'パン屋', '焼き立てパン', '不二家', 'モンテール', 'コージーコーナー', 'シャトレーゼ', 'ヴィドフランス', 'アンデルセン']),
    G('飲み', ['居酒屋', '酒場', '酒', '酔', '飲み', 'やきとん', 'やきとり', '焼鳥', '焼き鳥', '鳥貴族', '鳥メロ', '鳥劇場', '串かつ', '串カツ', '串揚げ', '串',
      '磯丸水産', '魚民', '白木屋', '笑笑', '和民', '庄や', '土間土間', '北の家族', '目利きの銀次', '塚田農場', '熱中屋', '金の蔵', '養老乃瀧', 'テング酒場', '天狗',
      '世界の山ちゃん', '山ちゃん', 'ホルモン', 'もつ焼', 'もつ鍋', '立ち飲み', 'パブ', '新時代', 'izakaya', 'スナック', 'ビアホール', 'ビアガーデン', 'ビール', 'ワイン', '日本酒',
      'ハイボール', '角打ち', 'キャバクラ', 'ガールズバー', 'ショットバー', 'ラウンジ', 'とりいちず', '併呑', 'いっちょかみ', '酔っ手羽', '手羽先', '大衆酒場', '焼酎', '泡盛', '漁港', 'pocha', 'soju', 'makgeolli']),
    G('食費', ['マクドナルド', 'モスバーガー', 'ケンタッキー', 'バーガーキング', 'ロッテリア', 'フレッシュネス', 'ウェンディーズ', '吉野家', 'すき家', '松屋フーズ', 'なか卯', '天丼てんや',
      'てんや', '丸亀製麺', 'はなまるうどん', 'ゆで太郎', '富士そば', '幸楽苑', '日高屋', 'ハイデイ日高', '餃子の王将', '大阪王将', '王将', '来来亭', '来来軒', '天下一品',
      '一蘭', 'スガキヤ', 'リンガーハット', 'ガスト', 'サイゼリヤ', 'ジョナサン', 'バーミヤン', 'デニーズ', 'ココス', 'ロイヤルホスト', 'ジョイフル', '夢庵', '華屋与兵衛',
      'くら寿司', 'スシロー', 'はま寿司', 'かっぱ寿司', '魚べい', '小僧寿し', '銚子丸', '回転寿司', '寿司', 'すし', '焼肉', '牛角', '叙々苑', '安楽亭', 'やよい軒', '大戸屋',
      '松のや', 'かつや', 'とんかつ', '牛かつ', 'カレー', 'CoCo壱番屋', 'ココイチ', '餃子', 'ラーメン', 'らーめん', 'らぁ麺', '中華そば', '中華食堂', '中華料理', '中華', '油そば',
      '家系', '壱角家', '六厘舎', '麺屋', '麺', 'つけ麺', 'ちゃんぽん', 'うどん', 'そば', '蕎麦', '牛丼', '丼', '定食', '食堂', '料理', '弁当', 'ほっともっと', 'ほっかほっか亭',
      'オリジン弁当', 'ピザ', 'ドミノ', 'ピザーラ', 'ピザハット', 'サブウェイ', '銀だこ', 'うなぎ', 'ひつまぶし', '鰻', '天ぷら', 'ステーキ', 'いきなり', 'ブロンコビリー',
      'ビッグボーイ', 'レストラン', 'ダイニング', 'キッチン', 'ビストロ', 'グリル', 'バーガー', 'フード', '韓国料理', 'イタリアン', 'フレンチ', 'トラットリア', '炒飯',
      '鍋', 'しゃぶしゃぶ', 'すき焼', 'お好み焼', 'たこ焼', 'もんじゃ', '肉', 'Uber Eats', 'ウーバーイーツ', '出前館', 'デリバリー', '神田たまごけん',
      'イオン', 'イトーヨーカドー', 'ヨーカドー', 'マックスバリュ', 'まいばすけっと', '西友', 'サミットストア', 'サミット', 'オーケー', '業務スーパー', '東急ストア', 'マルエツ',
      'ヨークベニマル', 'ヤオコー', '成城石井', 'カスミ', 'ベルク', 'アピタ', 'ユニー', 'ダイエー', '万代', 'ビッグ・エー', 'ビッグエー', 'ロピア', 'コープ', 'マルヤ', 'スーパー',
      '青果', '精肉', '鮮魚', '食品', '食料', 'フードスクエア', '八百屋', '惣菜', 'トロ政', '康樂園', 'ちばチャン', 'だるまのめ', 'ramen', 'kitchen', 'restaurant', 'dining', 'sushi', 'pizza', 'curry', 'udon', 'soba', 'noodle',
      'steak', 'burger', 'bbq', 'bistro', 'gamjatang', 'kimchi', 'galbi', 'samgyeopsal', 'bulgogi', 'tteokbokki', 'freshway', 'fresh market',
      'emart', 'homeplus', 'lotte mart', 'マイバスケット', 'ジドウハンバイキ', 'ネギシ', 'NEXCO', 'SAPA', 'サービスエリア', 'パーキングエリア',
      '自動販売機', '自販機', 'ダイドードリンコ', 'ビバレッジ', 'コカ・コーラ', 'サントリー', '伊藤園', 'アサヒ飲料', 'キッチンカー']),
    // 駅名・路線名を含むが交通費ではない店(交通費より先に判定する)
    G('その他', ['百貨店', '東急ハンズ', 'ハンズ', 'ロフト', 'パルコ', 'マルイ', 'ルミネ', 'アトレ']),
    G('交通費', ['JR', 'Suica', 'スイカ', 'PASMO', 'パスモ', 'ICOCA', 'イコカ', '地下鉄', '東京メトロ', '都営', '東急', '小田急', '京王', '西武', '東武', '京成', '京急', '相鉄',
      '阪急', '阪神', '近鉄', '南海', '京阪', '名鉄', '西鉄', '電鉄', '鉄道', 'モノレール', '交通局', 'タクシー', '日本交通', '第一交通', 'S.RIDE', 'DiDi', 'Uber',
      'HELLO CYCLING', 'ハローサイクリング', 'LUUP', 'ルーポ', 'バイクシェア', 'レンタカー', 'タイムズ', 'カーシェア', 'リパーク', 'コインパーク', 'パーキング', '駐車', 'NPC24',
      'ナビパーク', 'ETCカード', '首都高', '高速道路', '高速バス', '路線バス', '市バス', '都バス', 'ウィラー', 'WILLER', 'バスターミナル', 'バス停', '自転車', 'etc東日本', 'etc中日本', 'etc西日本', 'etc特別割引', 'etc冬期割引', 'etc割引', 'etc名古屋', 'etc栃木', 'etc首都高', 'etc阪神', 'etc本四', 'taxi', 'metro', 'subway', 'railroad', 'korail', 't-money', 'transportation'])
  );

  // 照合用の正規化。NFKC+小文字化に加え、QUICPay等の表記ゆれ(長音が「-」、小書き仮名が大書き: マイバスケツト/ドンキホ-テ)をそろえる。
  // ルール側と店名側の両方に同じ変換をかけるので、通常の表記とも一致する。
  const SMALL = 'ァィゥェォッャュョヮ', BIG = 'アイウエオツヤユヨワ';
  const norm = s => String(s).normalize('NFKC').toLowerCase()
    .replace(/([ァ-ヴ])-/g, '$1ー')
    .replace(/[ァィゥェォッャュョヮ]/g, c => BIG[SMALL.indexOf(c)]);
  const DEFAULT_NORM = DEFAULT_RULES.map(([k, c]) => [norm(k), c]);

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

  const pad2 = n => String(n).padStart(2, '0');
  const PAYPAY_RE = /paypay|ペイペイ/, SAISON_RE = /セゾン|saison/;

  function toInt(s) {
    s = String(s == null ? '' : s).replace(/[,\s円]/g, '');
    return /^\d+$/.test(s) ? parseInt(s, 10) : 0;
  }

  // 一致するルールのカテゴリ。なければ null
  function matchRule(payee, rules) {
    const p = norm(payee);
    const list = (rules || []).map(r => [norm(r.keyword), r.category]).concat(DEFAULT_NORM);
    for (const [kw, cat] of list) if (kw && p.includes(kw)) return cat;
    return null;
  }
  function categorize(payee, rules) { return matchRule(payee, rules) || 'その他'; }

  // 支払い手段の表記を整える。「PayPayポイント (6円), PayPay残高 (187円)」→「PayPayポイント, PayPay残高」
  const normMethod = s => String(s == null ? '' : s).replace(/\s*\([^)]*円\)/g, '').replace(/\s+/g, ' ').trim();
  const methodParts = s => normMethod(s).split(/\s*,\s*/).filter(p => p && p !== '-');
  // カード払いか。クレジット・PayPayカードなどが対象。ポイント・残高・銀行口座は含めない。
  // カード番号などは、CSVに書かれている文字列をそのまま使い、コード側には何も書かない。
  const isCardMethod = p => /クレジット|カード|visa|master|jcb|amex|american express|diners/.test(norm(p)) && !/ポイント|残高/.test(p);

  // PayPayのCSV → {records, skipped:{取引内容:件数}, skippedAmt:{取引内容:金額}, meta}
  // meta.methods: 支払い手段ごとの件数 / meta.cardPaid: カード払いの件数・金額・カード表記
  function parsePayPay(text, rules) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('CSVが空です');
    const h = rows[0].map(s => s.trim());
    const ix = n => h.indexOf(n);
    const iDate = ix('取引日'), iOut = ix('出金金額（円）'), iIn = ix('入金金額（円）');
    const iType = ix('取引内容'), iPayee = ix('取引先'), iNo = ix('取引番号'), iMethod = ix('取引方法');
    if ([iDate, iOut, iIn, iType, iPayee, iNo].some(i => i < 0)) throw new Error('PayPayの取引履歴CSVではありません');
    const records = [], skipped = {}, skippedAmt = {};
    const meta = { format: 'paypay', methods: {}, cardPaid: { n: 0, amount: 0, labels: [] } };
    for (const r of rows.slice(1)) {
      const kind = TYPE_MAP[r[iType]];
      const amount = kind === 'income' ? toInt(r[iIn]) : toInt(r[iOut]);
      if (!kind || amount <= 0) {
        skipped[r[iType]] = (skipped[r[iType]] || 0) + 1;
        skippedAmt[r[iType]] = (skippedAmt[r[iType]] || 0) + toInt(r[iIn]) + toInt(r[iOut]);
        continue;
      }
      const payee = (r[iPayee] || '').trim();
      const category = r[iType] === '送った金額' ? '送金' : kind === 'income' ? '受取' : categorize(payee, rules);
      const method = iMethod < 0 ? '' : normMethod(r[iMethod]);
      const rec = {
        id: 'pp-' + r[iNo], date: r[iDate].slice(0, 10).replace(/\//g, '-'),
        type: kind, amount, payee, memo: '', category, source: 'paypay', method: method === '-' ? '' : method,
      };
      // セゾンカードの請求の支払いは、セゾンの利用明細で数える(dep='saison')。明細が取り込み済みの期間だけ、集計から外す
      if (kind === 'expense' && category !== 'カード引落' && SAISON_RE.test(norm(payee))) { rec.dep = 'saison'; rec.cat0 = category; }
      records.push(rec);
      if (kind === 'expense') {
        const parts = methodParts(method);
        for (const p of parts) meta.methods[p] = (meta.methods[p] || 0) + 1;
        const cards = parts.filter(isCardMethod);
        if (cards.length) {
          meta.cardPaid.n++; meta.cardPaid.amount += amount;
          for (const c of cards) if (!meta.cardPaid.labels.includes(c)) meta.cardPaid.labels.push(c);
        }
      }
    }
    return { records, skipped, skippedAmt, meta };
  }

  function hash36(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // セゾンカードの利用明細CSV(セゾンNetアンサー)。
  // 構成: 上部にカード名・お支払日・請求額 → 見出し行(ご利用日,ご利用先…,ご利用金額,備考) → 明細。
  //  ・海外利用は2行1組(2行目は「(SEOUL)」などの利用地と為替レート)
  //  ・手数料など日付のない行は、直前の明細の日付を使う
  //  ・取引番号がないため、日付+金額+利用先+同一明細内の連番でidを作る(同じファイルの再取り込みは重複扱い)
  function parseSaison(text, rules) {
    const rows = parseCsv(text);
    // 見出しは「利用日,ご利用店名及び商品名,…,利用金額,備考」。「ご利用日」「ご利用先ならびに…」「ご利用金額」の表記も受け付ける
    const isDate = c => /^(ご)?利用日$/.test(c.trim()), isAmt = c => /^(ご)?利用金額/.test(c.trim());
    const hi = rows.findIndex(r => r.some(isDate) && r.some(isAmt));
    if (hi < 0) throw new Error('セゾンカードの利用明細CSVではありません');
    const h = rows[hi].map(s => s.trim());
    const col = (pred, dflt) => { const i = h.findIndex(pred); return i < 0 ? dflt : i; };
    const iDate = col(isDate, 0), iPayee = col(c => /^(ご)?利用(先|店名)/.test(c), 1);
    const iAmt = col(isAmt, 5), iRem = col(c => c === '備考', 6);

    const meta = { format: 'saison', card: '', payDate: '', bill: 0 };
    for (const r of rows.slice(0, hi)) {
      const k = (r[0] || '').trim(), v = (r[1] || '').trim();
      if (k.includes('カード')) meta.card = v;
      else if (k.includes('支払日')) meta.payDate = v;
      else if (k.includes('請求額')) meta.bill = toInt(v);
    }

    const records = [], skipped = {}, seen = {};
    let last = null, lastDate = '';
    const skip = k => { skipped[k] = (skipped[k] || 0) + 1; };
    for (const r of rows.slice(hi + 1)) {
      const d = (r[iDate] || '').trim(), p = (r[iPayee] || '').replace(/\s+/g, ' ').trim();
      const amtRaw = (r[iAmt] || '').replace(/[,\s円]/g, ''), rem = (r[iRem] || '').trim();
      if (!d && !amtRaw) {
        // 海外利用の2行目(利用地・為替レート)は、直前の明細に付ける
        if (p.startsWith('(') && last) last.place = p.replace(/^\(|\)$/g, '');
        continue; // それ以外(注記・空行)は読み飛ばす
      }
      const dm = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(d);
      const date = dm ? dm[1] + '-' + pad2(dm[2]) + '-' + pad2(dm[3]) : lastDate;
      if (!/^-?\d+$/.test(amtRaw) || !date || !p) { skip('読み取れない行'); continue; }
      lastDate = date;
      const signed = parseInt(amtRaw, 10);
      if (signed === 0) { skip('金額0'); continue; }
      const amount = Math.abs(signed), foreign = rem.includes('現地通貨額');
      const local = foreign ? rem.replace(/^.*現地通貨額[:：]?\s*/, '') : '';
      const key = date + '|' + amount + '|' + p;
      seen[key] = (seen[key] || 0) + 1;
      // ルールに当てはまらない海外利用は「旅行」、それ以外は「その他」。返金(マイナス)は「受取」
      const category = signed < 0 ? '受取' : (matchRule(p, rules) || (foreign ? '旅行' : 'その他'));
      last = {
        id: 'sz-' + date.replace(/-/g, '') + '-' + amount + '-' + hash36(p) + '-' + seen[key], date,
        type: signed < 0 ? 'income' : 'expense', amount, payee: p, memo: '', local, place: '', category, source: 'saison',
      };
      // PayPay関連の行(チャージ・PayPay払いなど)は、PayPay側の明細で数える(dep='paypay')。二重にならないよう reconcile で調整する
      if (signed > 0 && PAYPAY_RE.test(norm(p))) { last.dep = 'paypay'; last.cat0 = category; }
      records.push(last);
    }
    for (const t of records) { t.memo = [t.local, t.place].filter(Boolean).join(' / '); delete t.local; delete t.place; }
    meta.total = records.reduce((a, t) => a + (t.type === 'income' ? -t.amount : t.amount), 0);
    return { records, skipped, meta };
  }

  // 形式を自動判定して取り込む(PayPay / セゾンカード)
  function parseStatement(text, rules) {
    const rows = parseCsv(text);
    const has = (re) => rows.slice(0, 12).some(r => r.some(c => re.test(c.trim())));
    if (has(/^取引日$/) && has(/^取引内容$/)) return parsePayPay(text, rules);
    if (has(/^(ご)?利用日$/)) return parseSaison(text, rules);
    throw new Error('PayPayまたはセゾンカードのCSVではありません');
  }

  // 二重計上の調整(取り込みのたびに、保存済みの全取引に対して行う)。
  // 取引の dep は「この行の買い物は、どの明細(paypay / saison)で数えるか」を表す。
  //  ・その明細が取り込み済みで、日付がその明細の期間内 → 向こうで数えるので、この行は集計から外す(カテゴリ「カード引落」)
  //  ・その明細が未取り込み、または期間外 → この行を数える(抜けを防ぐ)。カテゴリは元(cat0)に戻す
  // 手動でカテゴリを変えた取引(manual)は触らない。取り込む順番に関係なく、同じ結果になる。
  function reconcile(txs) {
    const cov = {};
    for (const t of txs) {
      if (t.source !== 'paypay' && t.source !== 'saison') continue;
      const c = cov[t.source] || (cov[t.source] = { from: t.date, to: t.date });
      if (t.date < c.from) c.from = t.date;
      if (t.date > c.to) c.to = t.date;
    }
    const stat = { covered: 0, kept: 0, changed: 0, coverage: cov };
    for (const t of txs) {
      if (!t.dep || t.manual) continue;
      const c = cov[t.dep], covered = !!c && t.date >= c.from && t.date <= c.to;
      const target = covered ? 'カード引落' : (t.cat0 || 'その他');
      if (t.category !== target) { t.category = target; stat.changed++; }
      if (covered) stat.covered++; else stat.kept++;
    }
    return stat;
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

  root.Core = { DEFAULT_CATS, DEFAULT_RULES, parseCsv, parsePayPay, parseSaison, parseStatement, reconcile, categorize, mergeImport, summarize, addMonths, monthlyExpense, dailyTotals, searchTxs, toCsv };
})(typeof window !== 'undefined' ? window : globalThis);
