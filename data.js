/* ===== マスタデータ（デモ用のサンプル値）=====
   金額・容積・作業時間はすべて仮置きです。実データ提供後に差し替えます。 */

/* ---- 品目マスタ：荷姿（梱包状態）の容積・重量と、設置に要する人時 ---- */
const ITEMS = [
  { id:"ref-l",  cat:"家電", name:"冷蔵庫（400L以上）",     m3:1.20, kg: 85, min:25, crew:2 },
  { id:"ref-s",  cat:"家電", name:"冷蔵庫（300L未満）",     m3:0.65, kg: 50, min:15, crew:2 },
  { id:"wm-d",   cat:"家電", name:"洗濯機（ドラム式）",      m3:0.75, kg: 80, min:30, crew:2 },
  { id:"wm-v",   cat:"家電", name:"洗濯機（縦型）",          m3:0.55, kg: 40, min:20, crew:1 },
  { id:"tv-40",  cat:"家電", name:"テレビ（40型）",          m3:0.18, kg: 12, min:15, crew:1 },
  { id:"tv-55",  cat:"家電", name:"テレビ（55型）",          m3:0.30, kg: 20, min:20, crew:2 },
  { id:"tv-65",  cat:"家電", name:"テレビ（65型以上）",      m3:0.45, kg: 30, min:25, crew:2 },
  { id:"ac",     cat:"家電", name:"エアコン（室内機＋室外機）", m3:0.35, kg: 45, min:60, crew:2 },
  { id:"mw",     cat:"家電", name:"電子レンジ",              m3:0.12, kg: 15, min: 5, crew:1 },
  { id:"bed",    cat:"家具", name:"ベッドフレーム（シングル）", m3:0.55, kg: 35, min:25, crew:2 },
  { id:"mat",    cat:"家具", name:"マットレス（シングル）",   m3:0.45, kg: 20, min:10, crew:1 },
  { id:"desk",   cat:"家具", name:"デスク",                  m3:0.40, kg: 25, min:15, crew:1 },
  { id:"chair",  cat:"家具", name:"チェア",                  m3:0.25, kg: 12, min: 5, crew:1 },
  { id:"chest",  cat:"家具", name:"収納家具（チェスト等）",   m3:0.60, kg: 40, min:15, crew:2 },
  { id:"locker", cat:"什器", name:"ロッカー（4人用）",        m3:0.80, kg: 55, min:20, crew:2 },
  { id:"shelf",  cat:"什器", name:"スチール棚（1連）",        m3:0.50, kg: 30, min:25, crew:2 }
];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

/* ---- 車両マスタ：荷台の積載容積と最大積載重量 ---- */
const VEHICLES = [
  { id:"kei", name:"軽トラック", m3: 3.0, kg:  350 },
  { id:"2t",  name:"2t車",       m3:10.0, kg: 2000 },
  { id:"4t",  name:"4t車",       m3:22.0, kg: 4000 },
  { id:"10t", name:"10t車",      m3:50.0, kg:10000 }
];
const LOAD_EFFICIENCY = 0.80;   // 実務上の積載効率（隙間・積付けの都合）

/* ---- 作業係数 ---- */
const WORK = {
  unloadMinPerM3: 4,      // 荷降ろし：総容積1m3あたりの人時（分）
  shiftMinutes: 360,      // 1日1名あたりの現場稼働時間（6時間）
  laborRate: 4500,        // 作業単価（円／人時）
  maxCrewPerVehicle: 4    // 1台あたりに乗れる作業員の上限
};

/* 納品先条件による作業量の補正 */
const SITE_FLOOR = {
  "1階（横持ちなし）":            1.00,
  "2階以上・エレベーターあり":    1.10,
  "2階・エレベーターなし":        1.35,
  "3階以上・エレベーターなし":    1.70
};
const ROAD_WIDTH = {
  "4m以上（大型可）":      1.00,
  "3〜4m（中型まで）":     1.08,
  "2〜3m（小型のみ）":     1.18,
  "2m未満（横持ち発生）":   1.35
};
const SEASON = {
  "通常期":           1.00,
  "週末・祝日":       1.05,
  "繁忙期（3〜4月）": 1.15,
  "年末年始":         1.20
};
const PARTNERS = {
  "自社便":                1.00,
  "協力会社A（関東圏）":    0.96,
  "協力会社B（全国）":      1.04,
  "協力会社C（スポット）":  1.10
};
const DISPOSAL_FEE = 6200;   // リサイクル回収1台あたり

/* ---- 車両タリフ：1台あたりの運賃（距離帯 × 車格）---- */
const TARIFF_AREAS = ["関東", "東海", "関西"];
const TARIFF_MAX_KM = 700;
const TARIFF = {
  "軽トラック": [[50,14000],[100,20000],[200,31000],[300,43000],[500,64000],[700,86000]],
  "2t車":       [[50,22000],[100,31000],[200,48000],[300,66000],[500,98000],[700,132000]],
  "4t車":       [[50,28000],[100,40000],[200,62000],[300,86000],[500,127000],[700,171000]],
  "10t車":      [[50,38000],[100,54000],[200,84000],[300,117000],[500,173000],[700,233000]]
};

/* ---- 拠点：走行距離の自動算出用 ---- */
const CITIES = {
  "札幌":{lat:43.062,lon:141.354,area:"北海道"}, "青森":{lat:40.824,lon:140.740,area:"東北"},
  "盛岡":{lat:39.703,lon:141.152,area:"東北"},   "仙台":{lat:38.268,lon:140.869,area:"東北"},
  "新潟":{lat:37.902,lon:139.023,area:"北陸"},   "金沢":{lat:36.561,lon:136.656,area:"北陸"},
  "さいたま":{lat:35.861,lon:139.646,area:"関東"},"東京":{lat:35.689,lon:139.692,area:"関東"},
  "千葉":{lat:35.605,lon:140.123,area:"関東"},   "横浜":{lat:35.444,lon:139.638,area:"関東"},
  "静岡":{lat:34.977,lon:138.383,area:"東海"},   "名古屋":{lat:35.181,lon:136.906,area:"東海"},
  "京都":{lat:35.011,lon:135.768,area:"関西"},   "大阪":{lat:34.694,lon:135.502,area:"関西"},
  "神戸":{lat:34.690,lon:135.196,area:"関西"},   "広島":{lat:34.385,lon:132.455,area:"中国"},
  "高松":{lat:34.342,lon:134.047,area:"四国"},   "福岡":{lat:33.590,lon:130.402,area:"九州"},
  "熊本":{lat:32.803,lon:130.708,area:"九州"},   "鹿児島":{lat:31.596,lon:130.557,area:"九州"}
};

/* ---- 案件プリセット（法人向けの典型パターン）---- */
const PRESETS = {
  "hotel": { label:"ホテル客室 テレビ50台入替",
    from:"東京", to:"横浜", floor:"2階以上・エレベーターあり", road:"4m以上（大型可）",
    days:1, recycle:true,
    lines:[ {id:"tv-55", qty:50} ] },
  "dorm": { label:"学生寮30室 家電4点＋家具",
    from:"さいたま", to:"仙台", floor:"2階・エレベーターなし", road:"3〜4m（中型まで）",
    days:3, recycle:false,
    lines:[ {id:"ref-s", qty:30}, {id:"wm-v", qty:30}, {id:"tv-40", qty:30},
            {id:"mw", qty:30}, {id:"bed", qty:30}, {id:"mat", qty:30}, {id:"desk", qty:30}, {id:"chair", qty:30} ] },
  "office": { label:"オフィス移転 什器一式",
    from:"東京", to:"名古屋", floor:"2階以上・エレベーターあり", road:"4m以上（大型可）",
    days:2, recycle:false,
    lines:[ {id:"desk", qty:40}, {id:"chair", qty:40}, {id:"locker", qty:12}, {id:"shelf", qty:20} ] },
  "single": { label:"単身向け 家電3点セット（1件）",
    from:"東京", to:"千葉", floor:"2階・エレベーターなし", road:"2〜3m（小型のみ）",
    days:1, recycle:true,
    lines:[ {id:"ref-s", qty:1}, {id:"wm-v", qty:1}, {id:"mw", qty:1} ] }
};

/* ---- 案件管理表の初期データ ---- */
const INITIAL_DEALS = [
  { no:"Q-2026-0044", date:"2026-09-01", customer:"関東電機販売株式会社", route:"東京 → 名古屋", summary:"テレビ20台", total:  312400, status:"受注",  owner:"営業1課 佐藤" },
  { no:"Q-2026-0047", date:"2026-09-03", customer:"西日本リテール株式会社", route:"大阪 → 広島", summary:"冷蔵庫・洗濯機 各40台", total: 986300, status:"提出済", owner:"営業2課 鈴木" },
  { no:"Q-2026-0051", date:"2026-09-07", customer:"株式会社サンプル商事",   route:"東京 → 福岡", summary:"学生寮 家電4点×60室", total:1842700, status:"提出済", owner:"営業1課 高橋" },
  { no:"Q-2026-0055", date:"2026-09-10", customer:"北陸インテリア株式会社", route:"さいたま → 金沢", summary:"什器一式", total: 487400, status:"失注",  owner:"営業1課 佐藤" },
  { no:"Q-2026-0058", date:"2026-09-14", customer:"株式会社サンプル物産",   route:"横浜 → 仙台", summary:"ホテル テレビ50台", total: 763900, status:"作成中", owner:"営業2課 田中" }
];

/* ---- ばらつき分析：同一条件での担当者別見積額 ---- */
const VARIANCE = {
  condition: "横浜 → 仙台 ／ テレビ55型 50台 ／ 2階以上EVあり ／ 通常期",
  before: [ {who:"担当A", amount:698000}, {who:"担当B", amount:812000},
            {who:"担当C", amount:745000}, {who:"担当D", amount:889000} ],
  after:  [ {who:"担当A", amount:763900}, {who:"担当B", amount:763900},
            {who:"担当C", amount:779200}, {who:"担当D", amount:763900} ]
};
