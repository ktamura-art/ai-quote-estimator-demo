/* ===== 見積エンジン（第1層タリフ／第2層AI類似検索／第3層補正）===== */

function distanceKm(fromCity, toCity) {
  const a = CITIES[fromCity], b = CITIES[toCity];
  if (!a || !b) return 0;
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon/2)**2;
  const straight = 2 * R * Math.asin(Math.sqrt(h));
  return Math.round(straight * 1.25); // 直線距離 → 実走行距離の補正
}

/* 第1層：タリフ（確定ルール）が適用できるか */
function tariffLookup(area, vehicle, km) {
  if (!TARIFF_AREAS.includes(area) || km > TARIFF_MAX_KM) return null;
  const bands = TARIFF[vehicle];
  for (const [max, price] of bands) {
    if (km <= max) return { price, band: `〜${max}km`, vehicle };
  }
  return null;
}

/* 第2層：過去見積から条件の近い案件を検索 */
function findSimilar(input, topN) {
  const scored = PAST_QUOTES.map(q => {
    let s = 0;
    if (q.vehicle === input.vehicle) s += 40;
    if (q.area === input.area) s += 25;
    if (q.work === input.work) s += 20;
    const dMax = Math.max(q.distance, input.km) || 1;
    s += 15 * Math.max(0, 1 - Math.abs(q.distance - input.km) / dMax);
    return { ...q, score: Math.round(s) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, topN || 5);
}

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m-1] + a[m]) / 2);
}

/* メインの見積算出 */
function estimate(input) {
  const km = input.km;
  const lines = [];
  let ruleAmount = 0, aiAmount = 0;

  /* --- 基本運賃 --- */
  const tariff = tariffLookup(input.area, input.vehicle, km);
  let freight, basis;
  if (tariff) {
    freight = tariff.price * input.units;
    basis = {
      layer: "rule",
      label: "第1層：タリフ（確定ルール）",
      detail: `運賃表 ${input.vehicle}車・${tariff.band} → ${fmt(tariff.price)}円 × ${input.units}台`,
      refs: []
    };
    ruleAmount += freight;
  } else {
    const similar = findSimilar(input, 5);
    const unit = median(similar.map(q => q.kmUnit));
    freight = Math.round(unit * km * input.units / 100) * 100;
    basis = {
      layer: "ai",
      label: "第2層：過去実績AI（類似案件検索）",
      detail: `タリフ対象外（${input.area}／${km}km）のため、類似${similar.length}件のkm単価 中央値 ${fmt(unit)}円/km × ${km}km × ${input.units}台`,
      refs: similar
    };
    aiAmount += freight;
  }
  lines.push({ name: "基本運賃", detail: `${input.from} → ${input.to}　${km}km　${input.vehicle}車 ${input.units}台`, amount: freight, src: tariff ? "タリフ" : "AI推定" });

  /* --- 作業費 --- */
  const w = WORK_TYPES[input.work];
  const laborHours = +(w.hours * input.units).toFixed(1);
  const labor = Math.round(laborHours * input.workers * LABOR_RATE);
  if (labor > 0) {
    lines.push({ name: "荷役・作業費", detail: `${w.note}　標準${w.hours}h × ${input.units}台 × ${input.workers}名 × ${fmt(LABOR_RATE)}円/人時`, amount: labor, src: "タリフ" });
    ruleAmount += labor;
  }
  if (w.setup > 0) {
    const setup = w.setup * input.units;
    lines.push({ name: "設置・据付費", detail: `${fmt(w.setup)}円 × ${input.units}台`, amount: setup, src: "タリフ" });
    ruleAmount += setup;
    }
  if (w.recycle > 0) {
    const rec = w.recycle * input.units;
    lines.push({ name: "回収・処分費", detail: `${fmt(w.recycle)}円 × ${input.units}台（リサイクル券・マニフェスト含む）`, amount: rec, src: "タリフ" });
    ruleAmount += rec;
  }

  /* --- 第3層：補正 --- */
  const base = lines.reduce((s, l) => s + l.amount, 0);
  const roadCo = ROAD_WIDTH[input.road], seasonCo = SEASON[input.season], partnerCo = PARTNERS[input.partner];

  const roadAdd = Math.round(base * (roadCo - 1));
  if (roadAdd !== 0) {
    lines.push({ name: "搬入難度加算", detail: `前面道幅 ${input.road}　係数 ×${roadCo.toFixed(2)}`, amount: roadAdd, src: "補正" });
    ruleAmount += roadAdd;
  }
  const seasonAdd = Math.round(base * (seasonCo - 1));
  if (seasonAdd !== 0) {
    lines.push({ name: "時期加算", detail: `${input.season}　係数 ×${seasonCo.toFixed(2)}`, amount: seasonAdd, src: "補正" });
    ruleAmount += seasonAdd;
  }
  const partnerAdj = Math.round(freight * (partnerCo - 1));
  if (partnerAdj !== 0) {
    lines.push({ name: "パートナー原価調整", detail: `${input.partner}　係数 ×${partnerCo.toFixed(2)}`, amount: partnerAdj, src: "補正" });
    ruleAmount += partnerAdj;
  }

  /* --- 実費 --- */
  if (input.waitHours > 0) {
    const wait = Math.round(input.waitHours * WAIT_RATE);
    lines.push({ name: "待機料", detail: `${input.waitHours}時間 × ${fmt(WAIT_RATE)}円/時`, amount: wait, src: "タリフ" });
    ruleAmount += wait;
  }
  if (input.highway) {
    const hw = Math.round(km * 26 * input.units / 100) * 100;
    lines.push({ name: "高速道路料金", detail: `${km}km × 約26円/km × ${input.units}台（実費請求）`, amount: hw, src: "実費" });
    ruleAmount += hw;
  }
  const fuel = Math.round(freight * FUEL_RATE / 100) * 100;
  lines.push({ name: "燃料サーチャージ", detail: `基本運賃 × ${(FUEL_RATE*100).toFixed(0)}%`, amount: fuel, src: "タリフ" });
  ruleAmount += fuel;

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const ruleShare = Math.round(ruleAmount / subtotal * 100);

  return {
    input, lines, subtotal, basis,
    ruleShare, aiShare: 100 - ruleShare,
    coef: { road: roadCo, season: seasonCo, partner: partnerCo }
  };
}

const fmt = n => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ja-JP");
