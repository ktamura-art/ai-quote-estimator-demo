/* ===== 見積エンジン =====
   荷物明細 → 積載量 → 必要車両台数 → 必要作業人数 → 金額 の順に決定的に計算します。
   生成AIは一切使いません（同じ条件なら必ず同じ結果になります）。 */

const fmt = n => (n < 0 ? "-" : "") + Math.abs(Math.round(n)).toLocaleString("ja-JP");

function distanceKm(a, b) {
  const p = CITIES[a], q = CITIES[b];
  if (!p || !q) return 0;
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(q.lat - p.lat), dLon = rad(q.lon - p.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLon/2)**2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25);
}

/* 前面道幅で入れる車格を制限する */
function allowedVehicles(road) {
  if (road === "2m未満（横持ち発生）") return ["軽トラック"];
  if (road === "2〜3m（小型のみ）")    return ["軽トラック", "2t車"];
  if (road === "3〜4m（中型まで）")    return ["軽トラック", "2t車", "4t車"];
  return VEHICLES.map(v => v.name);
}

/* 距離帯から1台あたりの運賃を引く。タリフ外は実績ベースのkm単価で推定 */
function vehicleFare(vName, km, area) {
  const bands = TARIFF[vName];
  const inTariff = TARIFF_AREAS.includes(area) && km <= TARIFF_MAX_KM;
  if (inTariff) {
    for (const [max, price] of bands) if (km <= max) return { price, src: "タリフ", band: `〜${max}km` };
  }
  // タリフ外：最長距離帯のkm単価に遠距離係数を掛けて推定
  const [maxKm, maxPrice] = bands[bands.length - 1];
  const perKm = maxPrice / maxKm;
  const price = Math.round(perKm * km * 1.15 / 1000) * 1000;
  return { price, src: "実績推定", band: `${fmt(Math.round(perKm * 1.15))}円/km × ${fmt(km)}km` };
}

/* ---- 1. 荷量の集計 ---- */
function summarize(lines) {
  let m3 = 0, kg = 0, setupMin = 0, minCrew = 1, qty = 0;
  const detail = [];
  for (const l of lines) {
    const it = ITEM_BY_ID[l.id];
    if (!it || !l.qty) continue;
    const vm = it.m3 * l.qty, wk = it.kg * l.qty, sm = it.min * it.crew * l.qty;
    m3 += vm; kg += wk; setupMin += sm; qty += l.qty;
    minCrew = Math.max(minCrew, it.crew);
    detail.push({ ...it, qty: l.qty, m3: vm, kg: wk, min: sm });
  }
  return { m3: +m3.toFixed(2), kg, setupMin, minCrew, qty, detail };
}

/* ---- 2. 車両構成（容積基準と重量基準の大きい方で台数を決める）---- */
function planVehicles(sum, road, km, area) {
  const allowed = allowedVehicles(road);
  const options = VEHICLES.filter(v => allowed.includes(v.name)).map(v => {
    const cap = v.m3 * LOAD_EFFICIENCY;
    const byVol = Math.ceil(sum.m3 / cap);
    const byWt  = Math.ceil(sum.kg / v.kg);
    const units = Math.max(byVol, byWt, 1);
    const fare  = vehicleFare(v.name, km, area);
    return { v, cap: +cap.toFixed(1), byVol, byWt, units,
             driver: byVol >= byWt ? "容積" : "重量",
             fare: fare.price, src: fare.src, band: fare.band,
             total: fare.price * units };
  });
  options.sort((a, b) => a.total - b.total || a.units - b.units);
  return { best: options[0], options };
}

/* ---- 3. 必要作業人数 ---- */
function planCrew(sum, floor, road, days) {
  const unloadMin = Math.round(sum.m3 * WORK.unloadMinPerM3);
  const baseMin = sum.setupMin + unloadMin;
  const fc = SITE_FLOOR[floor], rc = ROAD_WIDTH[road];
  const adjMin = Math.round(baseMin * fc * rc);
  const capacity = WORK.shiftMinutes * days;
  const byWorkload = Math.ceil(adjMin / capacity);
  const crew = Math.max(byWorkload, sum.minCrew);
  return { unloadMin, baseMin, adjMin, floorCoef: fc, roadCoef: rc,
           capacity, byWorkload, minCrew: sum.minCrew, crew,
           reason: byWorkload >= sum.minCrew ? "作業量" : "2名作業が必要な品目" };
}

/* ---- メイン ---- */
function estimate(input) {
  const km = distanceKm(input.from, input.to);
  const area = CITIES[input.to] ? CITIES[input.to].area : "－";
  const sum = summarize(input.lines);
  if (sum.qty === 0) return null;

  const crewPlan = planCrew(sum, input.floor, input.road, input.days);
  const vp = planVehicles(sum, input.road, km, area);

  /* 作業員が全員乗車できるだけの台数を確保する */
  const byCrew = Math.ceil(crewPlan.crew / WORK.maxCrewPerVehicle);
  const units = Math.max(vp.best.units, byCrew);
  const unitsDriver = byCrew > vp.best.units ? "乗車人数" : vp.best.driver;

  const lines = [];
  const freight = vp.best.fare * units;
  lines.push({ name:"車両費", src: vp.best.src, amount: freight,
    detail:`${input.from} → ${input.to}　${fmt(km)}km　${vp.best.v.name} ${units}台（${fmt(vp.best.fare)}円／台・${vp.best.band}）` });

  const labor = crewPlan.crew * input.days * (WORK.shiftMinutes/60) * WORK.laborRate;
  lines.push({ name:"作業費", src:"タリフ", amount: labor,
    detail:`${crewPlan.crew}名 × ${input.days}日 × ${WORK.shiftMinutes/60}時間 × ${fmt(WORK.laborRate)}円／人時` });

  if (input.recycle) {
    const rec = DISPOSAL_FEE * sum.qty;
    lines.push({ name:"リサイクル回収費", src:"タリフ", amount: rec,
      detail:`${fmt(DISPOSAL_FEE)}円 × ${sum.qty}台（リサイクル券・マニフェスト含む）` });
  }

  const base = lines.reduce((s,l) => s + l.amount, 0);
  const sc = SEASON[input.season], pc = PARTNERS[input.partner];
  const seasonAdd = Math.round(base * (sc - 1));
  if (seasonAdd) lines.push({ name:"時期加算", src:"補正", amount: seasonAdd, detail:`${input.season}　係数 ×${sc.toFixed(2)}` });
  const partnerAdj = Math.round(freight * (pc - 1));
  if (partnerAdj) lines.push({ name:"パートナー原価調整", src:"補正", amount: partnerAdj, detail:`${input.partner}　係数 ×${pc.toFixed(2)}` });

  if (input.highway) {
    const hw = Math.round(km * 26 * units / 100) * 100;
    lines.push({ name:"高速道路料金", src:"実費", amount: hw, detail:`${fmt(km)}km × 約26円/km × ${units}台（実費請求）` });
  }
  const fuel = Math.round(freight * 0.06 / 100) * 100;
  lines.push({ name:"燃料サーチャージ", src:"タリフ", amount: fuel, detail:"車両費 × 6%" });

  const subtotal = lines.reduce((s,l) => s + l.amount, 0);
  const ruleAmount = lines.filter(l => l.src !== "実績推定").reduce((s,l) => s + l.amount, 0);

  return { input, km, area, sum, crewPlan, vehicle: vp.best, options: vp.options,
           units, unitsDriver, lines, subtotal,
           ruleShare: Math.round(ruleAmount / subtotal * 100),
           aiShare: 100 - Math.round(ruleAmount / subtotal * 100),
           coef:{ season: sc, partner: pc } };
}
