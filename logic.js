/* ===== 料金ロジック（マスタ）の表示と編集 =====
   「編集する」で入力欄に切り替わり、「保存して反映」で次の算出から新しい値が使われます。
   変更した項目・変更前後の値は変更履歴に残ります。 */

let editing = false, draft = null;

/* ---- 項目の定義（表示単位・入力範囲）---- */
const ITEM_FIELDS = [
  { k:"m3",   label:"容積",     unit:"m³",  step:0.05, min:0.01, max:20,   dec:2 },
  { k:"kg",   label:"重量",     unit:"kg",  step:1,    min:1,    max:3000, int:true },
  { k:"min",  label:"設置時間", unit:"分",  step:5,    min:0,    max:600,  int:true },
  { k:"crew", label:"必要人数", unit:"名",  step:1,    min:1,    max:6,    int:true }
];
const VEH_FIELDS = [
  { k:"m3", label:"荷台の積載容積", unit:"m³", step:0.5, min:0.5, max:100,   dec:1 },
  { k:"kg", label:"最大積載重量",   unit:"kg", step:50,  min:100, max:30000, int:true }
];
const BASE_FIELDS = [
  { path:"WORK.laborRate",         label:"作業単価",                 unit:"円／人時",  step:100,  min:0,   max:50000, int:true, note:"作業費 ＝ 人数 × 日数 × 稼働時間 × 作業単価" },
  { path:"WORK.shiftMinutes",      label:"1名あたりの現場稼働",      unit:"分／日",    step:10,   min:60,  max:720,   int:true, note:"必要人数の割り算に使う1日の稼働時間" },
  { path:"WORK.unloadMinPerM3",    label:"荷降ろし時間",             unit:"分／m³",    step:0.5,  min:0,   max:60,    dec:1, note:"総容積に掛けて荷降ろしの人時を出す" },
  { path:"WORK.maxCrewPerVehicle", label:"1台に乗れる作業員",        unit:"名",        step:1,    min:1,   max:8,     int:true, note:"作業員が全員乗れる台数を確保する" },
  { path:"RATES.loadEfficiency",   label:"積載効率",                 unit:"%",         step:1,    min:10,  max:100,   pct:true, note:"荷台容積のうち実際に積める割合" },
  { path:"RATES.disposalFee",      label:"リサイクル回収費",         unit:"円／台",    step:100,  min:0,   max:100000, int:true, note:"旧品回収ありのとき台数に掛ける" },
  { path:"RATES.highwayPerKm",     label:"高速道路料金の目安",       unit:"円／km・台", step:1,   min:0,   max:500,   int:true, note:"実費精算の見込み額" },
  { path:"RATES.fuelRate",         label:"燃料サーチャージ",         unit:"%",         step:0.5,  min:0,   max:50,    pct:true, note:"車両費に対する率" },
  { path:"RATES.tariffMaxKm",      label:"タリフを適用する距離の上限", unit:"km",      step:10,   min:0,   max:3000,  int:true, note:"これを超える距離は実績ベースで推定" },
  { path:"RATES.remoteFactor",     label:"タリフ外の遠距離係数",     unit:"倍",        step:0.01, min:0.5, max:3,     dec:2, note:"タリフ外の運賃推定に掛ける係数" }
];
const COEF_F  = { step:0.01, min:0.5, max:3, coef:true };
const MONEY_F = { step:1000, min:0, max:9999999, int:true, money:true };
const CO_GROUPS = [["納品先の条件","SITE_FLOOR"], ["前面道幅","ROAD_WIDTH"], ["時期","SEASON"], ["パートナー企業","PARTNERS"]];
const AREAS = [...new Set(Object.values(CITIES).map(c => c.area))];
const CATS = ["家電", "家具", "什器"];

const getP = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
function setP(o, p, v){ const ks = p.split("."), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }

function fmtVal(v, f){
  if (v === undefined || v === null) return "－";
  if (f.coef)  return "×" + Number(v).toFixed(2);
  if (f.money) return fmt(v) + "円";
  if (f.pct)   return +(v * 100).toFixed(2) + "%";
  if (f.dec)   return Number(v).toFixed(f.dec) + " " + f.unit;
  return fmt(v) + (f.unit ? " " + f.unit : "");
}
const areaText = a => AREAS.filter(x => a.includes(x)).join("・") || "なし";

/* ---- 変更点の洗い出し（保存件数・変更履歴に使う）---- */
function diffMaster(from, to){
  const out = [];
  const add = (label, a, b, f) => { if (a !== b) out.push({ label, before: fmtVal(a, f), after: fmtVal(b, f) }); };
  const fromById = Object.fromEntries(from.ITEMS.map(i => [i.id, i]));
  const toIds = new Set(to.ITEMS.map(i => i.id));
  to.ITEMS.forEach(i => {
    const o = fromById[i.id];
    if (!o) { out.push({ label:`品目マスタ／${i.name}`, before:"－", after:"追加" }); return; }
    if (o.name !== i.name) out.push({ label:`品目マスタ／${o.name}／品目名`, before:o.name, after:i.name });
    if (o.cat !== i.cat)   out.push({ label:`品目マスタ／${i.name}／区分`, before:o.cat, after:i.cat });
    ITEM_FIELDS.forEach(f => add(`品目マスタ／${i.name}／${f.label}`, o[f.k], i[f.k], f));
  });
  from.ITEMS.forEach(o => { if (!toIds.has(o.id)) out.push({ label:`品目マスタ／${o.name}`, before:"登録あり", after:"削除" }); });
  to.VEHICLES.forEach((v, n) => VEH_FIELDS.forEach(f => add(`車両マスタ／${v.name}／${f.label}`, from.VEHICLES[n][f.k], v[f.k], f)));
  BASE_FIELDS.forEach(f => add(`基準値／${f.label}`, getP(from, f.path), getP(to, f.path), f));
  if (areaText(from.TARIFF_AREAS) !== areaText(to.TARIFF_AREAS))
    out.push({ label:"基準値／タリフ適用エリア", before: areaText(from.TARIFF_AREAS), after: areaText(to.TARIFF_AREAS) });
  CO_GROUPS.forEach(([t, key]) => Object.keys(to[key]).forEach(k => add(`作業係数／${t}／${k}`, from[key][k], to[key][k], COEF_F)));
  Object.keys(to.TARIFF).forEach(v => to.TARIFF[v].forEach((b, n) =>
    add(`車両タリフ／${v}／〜${b[0]}km`, from.TARIFF[v][n][1], b[1], MONEY_F)));
  return out;
}

/* ---- セル：閲覧時は値、編集時は入力欄 ---- */
let LIVE = null;   // 保存済みの値（編集中の「変更あり」判定用）
const DEF_ITEM = Object.fromEntries(DEFAULT_MASTER.ITEMS.map(i => [i.id, i]));

/* 保存済みの値。品目は追加・削除で行がずれるため id で突き合わせる */
function liveVal(path){
  const m = path.match(/^ITEMS\.(\d+)\.(\w+)$/);
  if (m && draft) {
    const it = draft.ITEMS[+m[1]], o = it && LIVE.ITEMS.find(x => x.id === it.id);
    return o ? o[m[2]] : undefined;
  }
  return getP(LIVE, path);
}

function numCell(S, path, f, defVal){
  const v = getP(S, path);
  if (editing) {
    const disp = f.pct ? +(v * 100).toFixed(2) : f.coef ? Number(v).toFixed(2) : f.dec ? Number(v).toFixed(f.dec) : v;
    const chg = liveVal(path) !== v;
    return `<td class="num"><input class="m-in${chg ? " chg" : ""}" type="number" inputmode="decimal" data-path="${path}"
      step="${f.step}" min="${f.min}" max="${f.max}"${f.int ? ' data-int="1"' : ""}${f.pct ? ' data-pct="1"' : ""} value="${disp}"
      aria-label="${esc(f.label || "設定値")}">${f.unit && !f.coef && !f.money ? `<span class="u">${f.unit}</span>` : ""}</td>`;
  }
  const mod = defVal !== undefined && defVal !== v;
  return `<td class="num${mod ? " mod" : ""}"${mod ? ` title="初期値：${esc(fmtVal(defVal, f))}"` : ""}>${fmtVal(v, f)}</td>`;
}

function renderLogic(){
  LIVE = masterSnapshot();
  const S = editing ? draft : LIVE, D = DEFAULT_MASTER;
  $("p-logic").classList.toggle("editing", editing);
  $("btn-logic-edit").hidden = editing;
  $("editbar").hidden = !editing;

  /* 品目マスタ */
  $("item-tbl").innerHTML = `<thead><tr><th>区分</th><th>品目</th><th class="num">容積</th><th class="num">重量</th>
    <th class="num">設置時間</th><th class="num">必要人数</th><th class="num">人時換算</th>${editing ? "<th></th>" : ""}</tr></thead><tbody>` +
    S.ITEMS.map((i, n) => {
      const d = DEF_ITEM[i.id] || {};
      const custom = !DEF_ITEM[i.id];
      const cat = editing
        ? `<td><select class="m-in sel" data-path="ITEMS.${n}.cat">${CATS.map(c => `<option${c === i.cat ? " selected" : ""}>${c}</option>`).join("")}</select></td>`
        : `<td>${esc(i.cat)}</td>`;
      const name = editing
        ? `<td><input class="m-in txt${liveVal(`ITEMS.${n}.name`) !== i.name ? " chg" : ""}" type="text" data-path="ITEMS.${n}.name" value="${esc(i.name)}" aria-label="品目名"></td>`
        : `<td><b>${esc(i.name)}</b>${custom ? ' <span class="pill adj">追加</span>' : ""}</td>`;
      return `<tr>${cat}${name}${ITEM_FIELDS.map(f => numCell(S, `ITEMS.${n}.${f.k}`, f, custom ? undefined : d[f.k])).join("")}
        <td class="num calc" data-calc="item-${n}">${fmt(i.min * i.crew)} 人時分</td>
        ${editing ? `<td class="ctr">${custom ? `<button class="del" data-del="${n}" title="この品目を削除">×</button>` : ""}</td>` : ""}</tr>`;
    }).join("") + `</tbody>`;
  $("item-foot").innerHTML = editing ? `<button class="ghost add" id="btn-item-add">＋ 品目を追加</button>
    <span class="hint">追加した品目は、保存すると見積作成の品目一覧に出ます。</span>` : "";

  /* 車両マスタ */
  $("veh-tbl").innerHTML = `<thead><tr><th>車格</th><th class="num">荷台の積載容積</th><th class="num">実効容積（効率<span data-calc="eff">${Math.round(S.RATES.loadEfficiency * 100)}</span>%）</th>
    <th class="num">最大積載重量</th><th class="ctr">乗車可能な作業員</th></tr></thead><tbody>` +
    S.VEHICLES.map((v, n) => `<tr><td><b>${esc(v.name)}</b></td>${numCell(S, `VEHICLES.${n}.m3`, VEH_FIELDS[0], D.VEHICLES[n].m3)}
      <td class="num calc" data-calc="veh-${n}">${(v.m3 * S.RATES.loadEfficiency).toFixed(1)} m³</td>
      ${numCell(S, `VEHICLES.${n}.kg`, VEH_FIELDS[1], D.VEHICLES[n].kg)}
      <td class="ctr calc" data-calc="crew">最大${S.WORK.maxCrewPerVehicle}名</td></tr>`).join("") + `</tbody>`;

  /* 基準値・単価 */
  const areaCell = editing
    ? `<td colspan="2"><div class="areas">${AREAS.map(a => `<label class="area-chk"><input type="checkbox" data-area="${a}"${S.TARIFF_AREAS.includes(a) ? " checked" : ""}>${a}</label>`).join("")}</div></td>`
    : `<td colspan="2" class="${areaText(D.TARIFF_AREAS) !== areaText(S.TARIFF_AREAS) ? "mod-l" : ""}">${AREAS.filter(a => S.TARIFF_AREAS.includes(a)).map(a => `<span class="chip">${a}</span>`).join("") || "なし"}</td>`;
  $("base-tbl").innerHTML = `<thead><tr><th>項目</th><th class="num" style="width:${editing ? 190 : 150}px">設定値</th><th>使いみち</th></tr></thead><tbody>` +
    BASE_FIELDS.map(f => `<tr><td><b>${f.label}</b></td>${numCell(S, f.path, f, getP(D, f.path))}<td class="note-c">${f.note}</td></tr>`).join("") +
    `<tr><td><b>タリフ適用エリア</b><span class="dt">到着地がこのエリア内ならタリフ、外なら実績ベースで推定</span></td>${areaCell}</tr></tbody>`;

  /* 作業係数 */
  $("coef-tbl").innerHTML = `<thead><tr><th style="width:190px">区分</th><th>設定値</th><th class="num" style="width:${editing ? 130 : 90}px">係数</th></tr></thead><tbody>` +
    CO_GROUPS.map(([t, key]) => Object.keys(S[key]).map((k, n) =>
      `<tr>${n === 0 ? `<td rowspan="${Object.keys(S[key]).length}"><b>${t}</b></td>` : ""}<td>${k}</td>${numCell(S, `${key}.${k}`, COEF_F, D[key][k])}</tr>`).join("")).join("") +
    `</tbody>`;

  /* 車両タリフ */
  const bands = S.TARIFF["4t車"].map(b => `〜${b[0]}km`);
  $("tariff-tbl").innerHTML = `<thead><tr><th>車格</th>${bands.map(b => `<th class="num">${b}</th>`).join("")}</tr></thead><tbody>` +
    Object.entries(S.TARIFF).map(([v, rows]) => `<tr><td><b>${v}</b></td>${rows.map((r, n) => numCell(S, `TARIFF.${v}.${n}.1`, MONEY_F, D.TARIFF[v][n][1])).join("")}</tr>`).join("") +
    `</tbody>`;

  /* 初期値からの変更の目印 */
  const fromDef = diffMaster(DEFAULT_MASTER, LIVE).length;
  $("logic-mod").innerHTML = !editing && fromDef
    ? `<span class="dot"></span>初期値から <b>${fromDef}</b> 箇所変更されています（<span class="dot"></span>の付いた値。マウスを合わせると初期値が出ます）`
    : "";
  $("logic-mod").hidden = editing || !fromDef;

  renderHistory();
  updateEditBar();
}

function renderHistory(){
  $("hist-area").innerHTML = masterHistory.length ? masterHistory.slice(0, 10).map(h => `
    <div class="hist"><div class="hist-h"><b>${esc(h.at)}</b><span>${esc(h.who)}</span><span class="pill jit">${h.changes.length}件</span></div>
      <ul>${h.changes.slice(0, 8).map(c => `<li><span class="hl">${esc(c.label)}</span><s>${esc(c.before)}</s><i>→</i><b>${esc(c.after)}</b></li>`).join("")}
        ${h.changes.length > 8 ? `<li class="more">ほか ${h.changes.length - 8} 件</li>` : ""}</ul></div>`).join("")
    : `<div class="hist-empty">まだ変更はありません。「編集する」から単価や係数を変えて保存すると、変更前後の値がここに残ります。</div>`;
}

/* ---- 計算列（人時換算・実効容積）を入力に合わせて更新 ---- */
function updateCalcCells(){
  const S = draft || LIVE;
  S.ITEMS.forEach((i, n) => { const c = document.querySelector(`[data-calc="item-${n}"]`); if (c) c.textContent = `${fmt(i.min * i.crew)} 人時分`; });
  S.VEHICLES.forEach((v, n) => { const c = document.querySelector(`[data-calc="veh-${n}"]`); if (c) c.textContent = `${(v.m3 * S.RATES.loadEfficiency).toFixed(1)} m³`; });
  const e = document.querySelector('[data-calc="eff"]'); if (e) e.textContent = Math.round(S.RATES.loadEfficiency * 100);
  document.querySelectorAll('[data-calc="crew"]').forEach(c => { c.textContent = `最大${S.WORK.maxCrewPerVehicle}名`; });
}

function updateEditBar(){
  if (!editing) return;
  const n = diffMaster(LIVE, draft).length;
  const bad = document.querySelectorAll("#p-logic .m-in.bad").length;
  $("chg-n").textContent = n;
  $("chg-bad").textContent = bad ? `入力エラー ${bad} 件（範囲外の値）` : "";
  $("btn-logic-save").disabled = bad > 0 || n === 0;
}

/* ---- 入力 ---- */
$("p-logic").addEventListener("input", e => {
  if (!editing) return;
  const el = e.target;
  if (el.dataset.area) {
    const a = el.dataset.area;
    draft.TARIFF_AREAS = el.checked ? [...new Set([...draft.TARIFF_AREAS, a])] : draft.TARIFF_AREAS.filter(x => x !== a);
    updateEditBar(); return;
  }
  const path = el.dataset.path; if (!path) return;
  if (el.tagName === "SELECT") setP(draft, path, el.value);
  else if (el.type === "text") {
    const v = el.value.trim();
    el.classList.toggle("bad", !v);
    if (v) setP(draft, path, v);
  } else {
    const raw = el.value, min = +el.min, max = +el.max;
    let v = parseFloat(raw);
    const bad = raw === "" || isNaN(v) || v < min || v > max || (el.dataset.int && !Number.isInteger(v));
    el.classList.toggle("bad", bad);
    if (!bad) { if (el.dataset.pct) v = +(v / 100).toFixed(4); setP(draft, path, v); }
  }
  if (!el.classList.contains("bad")) el.classList.toggle("chg", getP(draft, path) !== liveVal(path));
  updateCalcCells(); updateEditBar();
});

$("p-logic").addEventListener("click", e => {
  if (!editing) return;
  if (e.target.id === "btn-item-add") {
    draft.ITEMS.push({ id: "u" + Date.now().toString(36), cat: "家電", name: "新しい品目", m3: 0.30, kg: 20, min: 10, crew: 1 });
    renderLogic();
    const ins = document.querySelectorAll('#item-tbl input[type=text]');
    const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); }
    return;
  }
  const del = e.target.closest("[data-del]");
  if (del) { draft.ITEMS.splice(+del.dataset.del, 1); renderLogic(); }
});

/* ---- 編集の開始・保存・取り消し ---- */
$("btn-logic-edit").onclick = () => { editing = true; draft = masterSnapshot(); renderLogic(); };
$("btn-logic-cancel").onclick = () => { editing = false; draft = null; renderLogic(); toast("編集を取り消しました"); };
$("btn-logic-default").onclick = () => {
  draft = clone(DEFAULT_MASTER); renderLogic();
  toast("初期値を読み込みました。「保存して反映」を押すと確定します");
};
$("btn-logic-save").onclick = () => {
  const changes = diffMaster(LIVE, draft);
  if (!changes.length) return;
  applyMaster(draft);
  masterHistory.unshift({ at: nowStr(), who: "管理者（デモ）", changes });
  masterHistory = masterHistory.slice(0, 30);
  const saved = saveMaster();
  editing = false; draft = null;
  renderLogic();
  /* 見積作成の品目一覧・タリフ表示・表示中の算出結果を新しい値に合わせる */
  lines = lines.filter(l => ITEM_BY_ID[l.id]);
  if (!lines.length) lines = [{ id: ITEMS[0].id, qty: 1 }];
  renderLines(); refreshKm();
  const re = recalcCurrent();
  toast(`料金マスタを保存しました（${changes.length}件）。` +
    (re ? "表示中の見積も新しい値で再計算しました。" : "次の算出から反映されます。") +
    (saved ? "" : "※このブラウザでは保存できないため、再読み込みで元に戻ります。"));
};
