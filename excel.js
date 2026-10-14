/* ===== Excel出力 =====
   ExcelJS（cdnjs）を初回の出力時にだけ読み込み、.xlsx をブラウザ内で作って保存します。
   データはどこにも送信しません。 */

const EXCELJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
let excelLoading = null;
function loadExcelJS(){
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return excelLoading || (excelLoading = new Promise((ok, ng) => {
    const s = document.createElement("script");
    s.src = EXCELJS_URL;
    s.onload = () => ok(window.ExcelJS);
    s.onerror = () => { excelLoading = null; s.remove(); ng(new Error("ExcelJS を読み込めませんでした")); };
    document.head.appendChild(s);
  }));
}

async function exportXlsx(fileName, build, btn){
  if (btn) btn.disabled = true;
  try {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    wb.creator = "AI見積アシスタント（デモ）"; wb.created = new Date();
    build(wb);
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`${fileName} を出力しました`);
  } catch (e) {
    console.warn(e);
    toast("Excelを出力できませんでした。ネットワーク接続をご確認のうえ、もう一度お試しください。");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ---- 書式 ---- */
const XF = "游ゴシック";
const LINE = { style: "thin", color: { argb: "FFC9CED6" } };
const BOX = { top: LINE, left: LINE, bottom: LINE, right: LINE };
const YEN = '"¥"#,##0';
const NUM = "#,##0";
const fill = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const ymd = () => today().replace(/-/g, "");
const asDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00Z") : s;

function font(c, o = {}){ c.font = { name: XF, size: 10, ...o }; }
function head(row, from, to){
  for (let i = from; i <= to; i++) {
    const c = row.getCell(i);
    font(c, { bold: true, color: { argb: "FFFFFFFF" } });
    c.fill = fill("FF1F2A44"); c.border = BOX;
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  row.height = 22;
}
function cell(c, o = {}){
  font(c, o.font);
  c.border = BOX;
  c.alignment = { vertical: "middle", horizontal: o.h, wrapText: !!o.wrap, indent: o.indent };
  if (o.fmt) c.numFmt = o.fmt;
  if (o.fill) c.fill = fill(o.fill);
}
function title(ws, ref, text, sub){
  const c = ws.getCell(ref); c.value = text; font(c, { size: 14, bold: true });
  if (sub) { const r = ws.getCell(ref.replace(/\d+/, n => +n + 1)); r.value = sub; font(r, { size: 9, color: { argb: "FF667085" } }); }
}
/* 全角は2、半角は1として、折り返し後の行数から行の高さを決める */
function fitHeight(row, text, widthChars, size = 10){
  const w = [...String(text)].reduce((s, ch) => s + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
  const per = Math.max(10, Math.floor(widthChars * 1.1 * 10 / size));
  row.height = Math.max(20, Math.ceil(w / per) * (size + 4) + 6);
}
const ST_FILL = { 作成中: "FFFFF4EB", 提出済: "FFEEF2FF", 受注: "FFECFAF2", 失注: "FFFDF0EE" };
const ST_INK  = { 作成中: "FFC2410C", 提出済: "FF2742C2", 受注: "FF12804A", 失注: "FFC93A2E" };

/* ============ 案件管理表 ============ */
function buildDealsBook(wb){
  const ws = wb.addWorksheet("案件管理表", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.columns = [14, 12, 30, 18, 30, 16, 10, 14, 17].map(width => ({ width }));
  title(ws, "A1", "案件管理表", `出力日時 ${nowStr()}　／　登録 ${deals.length} 件`);
  const H = 4, first = H + 1, last = H + deals.length;
  ws.getRow(H).values = ["見積No", "作成日", "お客様", "区間", "内容", "見積金額（税込）", "ステータス", "担当", "最終更新"];
  head(ws.getRow(H), 1, 9);
  deals.forEach((d, i) => {
    const r = ws.getRow(first + i);
    r.values = [d.no, asDate(d.date), d.customer, d.route, d.summary, d.total, d.status, d.owner, d.updated || ""];
    for (let c = 1; c <= 9; c++) cell(r.getCell(c), {
      fmt: c === 2 ? "yyyy/mm/dd" : c === 6 ? YEN : undefined,
      h: c === 7 || c === 2 ? "center" : undefined, wrap: c === 3 || c === 5 });
    const st = r.getCell(7);
    st.fill = fill(ST_FILL[d.status] || "FFFFFFFF");
    font(st, { bold: true, color: { argb: ST_INK[d.status] || "FF101828" } });
    r.height = 20;
  });
  const t = ws.getRow(last + 1);
  t.getCell(5).value = "合計";
  t.getCell(6).value = { formula: `SUM(F${first}:F${last})`, result: deals.reduce((s, d) => s + d.total, 0) };
  [5, 6].forEach(c => cell(t.getCell(c), { font: { bold: true }, fmt: c === 6 ? YEN : undefined, fill: "FFF2F4F7", h: c === 5 ? "right" : undefined }));
  ws.autoFilter = { from: { row: H, column: 1 }, to: { row: last, column: 9 } };

  /* ステータス別集計（数式なので、案件管理表を書き換えると自動で再計算されます）*/
  const s2 = wb.addWorksheet("ステータス別集計");
  s2.columns = [16, 10, 18, 10].map(width => ({ width }));
  title(s2, "A1", "ステータス別集計", "「案件管理表」シートの値から数式で集計しています");
  s2.getRow(4).values = ["ステータス", "件数", "見積金額（税込）", "構成比"];
  head(s2.getRow(4), 1, 4);
  const G = `'案件管理表'!$G$${first}:$G$${last}`, F = `'案件管理表'!$F$${first}:$F$${last}`;
  const total = deals.reduce((s, d) => s + d.total, 0);
  STATUSES.forEach((st, i) => {
    const n = 5 + i, r = s2.getRow(n), list = deals.filter(d => d.status === st);
    const amt = list.reduce((s, d) => s + d.total, 0);
    r.getCell(1).value = st;
    r.getCell(2).value = { formula: `COUNTIF(${G},A${n})`, result: list.length };
    r.getCell(3).value = { formula: `SUMIF(${G},A${n},${F})`, result: amt };
    r.getCell(4).value = { formula: `IF($C$9=0,0,C${n}/$C$9)`, result: total ? amt / total : 0 };
    cell(r.getCell(1), { fill: ST_FILL[st], font: { bold: true, color: { argb: ST_INK[st] } }, h: "center" });
    cell(r.getCell(2), { fmt: NUM }); cell(r.getCell(3), { fmt: YEN }); cell(r.getCell(4), { fmt: "0.0%" });
  });
  const sumRow = s2.getRow(9);
  sumRow.getCell(1).value = "合計";
  sumRow.getCell(2).value = { formula: "SUM(B5:B8)", result: deals.length };
  sumRow.getCell(3).value = { formula: "SUM(C5:C8)", result: total };
  sumRow.getCell(4).value = { formula: "SUM(D5:D8)", result: total ? 1 : 0 };
  [1, 2, 3, 4].forEach(c => cell(sumRow.getCell(c), { font: { bold: true }, fill: "FFF2F4F7", fmt: [, "", NUM, YEN, "0.0%"][c], h: c === 1 ? "center" : undefined }));
  const won = deals.filter(d => d.status === "受注").length, closed = deals.filter(d => d.status === "受注" || d.status === "失注").length;
  const rate = s2.getRow(11);
  rate.getCell(1).value = "受注率";
  rate.getCell(2).value = { formula: "IF((B7+B8)=0,0,B7/(B7+B8))", result: closed ? won / closed : 0 };
  rate.getCell(3).value = "受注 ÷（受注＋失注）";
  cell(rate.getCell(1), { font: { bold: true }, h: "center" }); cell(rate.getCell(2), { fmt: "0%", font: { bold: true } });
  font(rate.getCell(3), { size: 9, color: { argb: "FF667085" } });
}

/* ============ 見積書（御見積書＋算出根拠）============ */
function buildQuoteBook(wb, r){
  const ws = wb.addWorksheet("御見積書", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }, horizontalCentered: true },
    views: [{ showGridLines: false }]
  });
  ws.columns = [2, 22, 30, 18, 18].map(width => ({ width }));
  ws.mergeCells("B2:E2");
  const t = ws.getCell("B2"); t.value = "御　見　積　書"; font(t, { size: 18, bold: true });
  t.alignment = { horizontal: "center", vertical: "middle" };
  ["B2", "C2", "D2", "E2"].forEach(a => { ws.getCell(a).border = { bottom: { style: "medium", color: { argb: "FF101828" } } }; });
  ws.getRow(2).height = 34;

  ws.mergeCells("B4:C4");
  const cu = ws.getCell("B4"); cu.value = `${r.customer || "（お客様名）"}　御中`; font(cu, { size: 13, bold: true });
  ["B4", "C4"].forEach(a => { ws.getCell(a).border = { bottom: { style: "thin", color: { argb: "FF101828" } } }; });
  ws.getRow(4).height = 24;
  const lead = ws.getCell("B5"); lead.value = "下記のとおりお見積り申し上げます。"; font(lead, { size: 9 });

  [[4, ISSUER.name, { size: 11, bold: true }], [5, ISSUER.address, { size: 9 }], [6, ISSUER.tel, { size: 9 }], [7, `担当：${ISSUER.staff}`, { size: 9 }]]
    .forEach(([row, v, f]) => { ws.mergeCells(`D${row}:E${row}`); const c = ws.getCell(`D${row}`); c.value = v; font(c, f); c.alignment = { vertical: "middle" }; });

  /* 明細 */
  const H = 13, first = H + 1, last = H + r.lines.length;
  ws.getRow(H).values = [null, "品名・項目", "仕様・内訳", null, "金額（円）"];
  ws.mergeCells(`C${H}:D${H}`); head(ws.getRow(H), 2, 5);
  r.lines.forEach((l, i) => {
    const n = first + i, row = ws.getRow(n);
    row.getCell(2).value = l.name; row.getCell(3).value = l.detail; row.getCell(5).value = l.amount;
    ws.mergeCells(`C${n}:D${n}`);
    cell(row.getCell(2), { font: { bold: true } });
    [3, 4].forEach(c => cell(row.getCell(c), { wrap: true, font: { size: 9, color: { argb: "FF475467" } } }));
    cell(row.getCell(5), { fmt: NUM });
    fitHeight(row, l.detail, 48, 9);
  });

  /* 合計（数式で再計算できるようにする）*/
  let n = last + 1;
  const sumRow = n;
  const put = (label, value, opt = {}) => {
    ws.mergeCells(`B${n}:D${n}`);
    const row = ws.getRow(n);
    row.getCell(2).value = label; row.getCell(5).value = value;
    [2, 3, 4].forEach(c => cell(row.getCell(c), { font: { bold: true, size: opt.size }, h: "right", fill: opt.fill || "FFF9FAFB" }));
    cell(row.getCell(5), { fmt: opt.fmt || NUM, font: { bold: true, size: opt.size }, fill: opt.fill || "FFF9FAFB" });
    row.height = opt.size ? 24 : 20;
    return n++;
  };
  put("小計", { formula: `SUM(E${first}:E${last})`, result: r.subtotal });
  const adjRow = r.adj !== 0 ? put("お値引き・調整", r.adj) : null;
  const base = adjRow ? `(E${sumRow}+E${adjRow})` : `E${sumRow}`;
  const taxRow = put("消費税（10%）", { formula: `ROUND(${base}*0.1,0)`, result: r.tax });
  const grandRow = put("合計金額", { formula: `${base}+E${taxRow}`, result: r.grand }, { size: 12, fill: "FFEEF2FF", fmt: YEN });

  /* 御見積金額・番号 */
  const gl = ws.getCell("B7"); gl.value = "御見積金額（税込）"; cell(gl, { font: { bold: true }, fill: "FFF2F4F7" });
  const gv = ws.getCell("C7"); gv.value = { formula: `E${grandRow}`, result: r.grand };
  cell(gv, { fmt: '"¥"#,##0" －"', font: { size: 16, bold: true }, fill: "FFF2F4F7", h: "right" });
  ws.getRow(7).height = 30;
  [["見積番号", r.no], ["発行日", asDate(r.date)], ["有効期限", "発行日より30日間"]].forEach(([k, v], i) => {
    const a = ws.getCell(`B${9 + i}`), b = ws.getCell(`C${9 + i}`);
    a.value = k; b.value = v; font(a, { size: 9, color: { argb: "FF667085" } }); font(b, { size: 10, bold: i === 0 });
    if (v instanceof Date) { b.numFmt = "yyyy年m月d日"; b.alignment = { horizontal: "left" }; }
  });

  /* 備考 */
  n += 1;
  const nh = ws.getCell(`B${n}`); nh.value = "備考"; font(nh, { bold: true, size: 9 }); n++;
  sheetNotes(r).forEach(text => {
    ws.mergeCells(`B${n}:E${n}`);
    const c = ws.getCell(`B${n}`); c.value = text; font(c, { size: 9, color: { argb: "FF475467" } });
    c.alignment = { wrapText: true, vertical: "top" }; fitHeight(ws.getRow(n), text, 86, 9); n++;
  });
  ws.pageSetup.printArea = `A1:E${n}`;

  buildBasisSheet(wb, r);
}

function buildBasisSheet(wb, r){
  const ws = wb.addWorksheet("算出根拠", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [28, 9, 15, 13, 15, 13, 18, 10, 17].map(width => ({ width }));
  title(ws, "A1", "算出根拠", `見積番号 ${r.no}　／　荷物明細 → 積載量 → 車両台数 → 作業人数 → 金額 の順に計算しています`);
  let n = 4;
  const section = text => { const c = ws.getCell(`A${n}`); c.value = text; font(c, { size: 11, bold: true, color: { argb: "FF2742C2" } }); n++; };
  const kv = (k, v, f) => {
    const a = ws.getCell(`A${n}`), b = ws.getCell(`B${n}`);
    a.value = k; b.value = v; cell(a, { fill: "FFF9FAFB", font: { bold: true } });
    ws.mergeCells(`B${n}:F${n}`); cell(b, { fmt: f }); n++;
  };

  section("条件");
  kv("区間", `${r.input.from} → ${r.input.to}`);
  kv("走行距離", `${fmt(r.km)} km（到着エリア：${r.area}）`);
  kv("納品先の条件", r.input.floor);
  kv("前面道幅", r.input.road);
  kv("作業日数・時期", `${r.input.days}日 ／ ${r.input.season}`);
  kv("パートナー企業", r.input.partner);
  n++;

  section("STEP 1　荷物明細から積載量を求める（台数を書き換えると再計算されます）");
  const h1 = n;
  ws.getRow(n).values = ["品目", "台数", "容積／台（m³）", "容積計（m³）", "重量／台（kg）", "重量計（kg）", "設置時間／台（分）", "必要人数", "設置人時計（分）"];
  head(ws.getRow(n), 1, 9); ws.getRow(n).height = 30; n++;
  const s1 = n;
  r.sum.detail.forEach(d => {
    const row = ws.getRow(n);
    const perM3 = +(d.m3 / d.qty).toFixed(3), perKg = Math.round(d.kg / d.qty), perMin = Math.round(d.min / d.qty / d.crew);
    row.values = [d.name, d.qty, perM3, { formula: `B${n}*C${n}`, result: d.m3 }, perKg, { formula: `B${n}*E${n}`, result: d.kg },
      perMin, d.crew, { formula: `B${n}*G${n}*H${n}`, result: d.min }];
    for (let c = 1; c <= 9; c++) cell(row.getCell(c), { fmt: c === 3 || c === 4 ? "#,##0.00" : c === 1 ? undefined : NUM });
    n++;
  });
  const e1 = n - 1, tot = ws.getRow(n);
  tot.values = ["合計", { formula: `SUM(B${s1}:B${e1})`, result: r.sum.qty }, null, { formula: `SUM(D${s1}:D${e1})`, result: r.sum.m3 }, null,
    { formula: `SUM(F${s1}:F${e1})`, result: r.sum.kg }, null, null, { formula: `SUM(I${s1}:I${e1})`, result: r.sum.setupMin }];
  for (let c = 1; c <= 9; c++) cell(tot.getCell(c), { font: { bold: true }, fill: "FFF2F4F7", fmt: c === 4 ? "#,##0.00" : c === 1 ? undefined : NUM });
  n += 2;

  section(`STEP 2　必要な車両台数を決める（積載効率 ${Math.round(r.params.loadEfficiency * 100)}%・前面道幅「${r.input.road}」で入れる車格のみ）`);
  ws.getRow(n).values = ["車格", "実効容積（m³）", "最大積載（kg）", "容積で必要", "重量で必要", "採用台数", "運賃／台（円）", "算出元", "運賃計（円）"];
  head(ws.getRow(n), 1, 9); ws.getRow(n).height = 30; n++;
  r.options.forEach(o => {
    const win = o.v.name === r.vehicle.v.name, row = ws.getRow(n);
    row.values = [o.v.name + (win ? "（採用）" : ""), o.cap, o.v.kg, o.byVol, o.byWt, o.units, o.fare, o.src, o.total];
    for (let c = 1; c <= 9; c++) cell(row.getCell(c), { fmt: c === 2 ? "#,##0.0" : c === 1 || c === 8 ? undefined : NUM,
      fill: win ? "FFEEF2FF" : undefined, font: win ? { bold: true } : undefined, h: c === 8 ? "center" : undefined });
    n++;
  });
  const note2 = ws.getCell(`A${n}`);
  note2.value = `作業員 ${r.crewPlan.crew}名の乗車に必要な台数も考慮 → 採用：${r.vehicle.v.name} × ${r.units}台（${r.unitsDriver}で決定／運賃合計が最小の車格）`;
  font(note2, { size: 9, color: { argb: "FF475467" } });
  n += 2;

  section("STEP 3　必要な作業人数を決める");
  const c = r.crewPlan;
  [["設置人時", c.baseMin - c.unloadMin, "分（品目ごとの標準時間 × 必要人数 × 台数）"],
   ["荷降ろし人時", c.unloadMin, `分（総容積 ${r.sum.m3.toFixed(2)}m³ × ${r.params.unloadMinPerM3}分/m³）`],
   ["小計", c.baseMin, "分"],
   ["納品先条件の係数", c.floorCoef, r.input.floor],
   ["前面道幅の係数", c.roadCoef, r.input.road],
   ["補正後の人時", c.adjMin, "分"],
   ["1名あたりの稼働", c.capacity, `分（${r.params.shiftMinutes}分 × ${r.input.days}日）`],
   ["作業量から必要な人数", c.byWorkload, "名"],
   ["品目の最低人数", c.minCrew, "名（2名作業が必要な品目を含む）"],
   ["採用人数", c.crew, `名（${c.reason}で決定）`]].forEach(([k, v, u]) => {
    const row = ws.getRow(n);
    row.getCell(1).value = k; row.getCell(2).value = v; row.getCell(3).value = u;
    cell(row.getCell(1), { fill: "FFF9FAFB", font: { bold: k === "採用人数" } });
    cell(row.getCell(2), { fmt: typeof v === "number" && !Number.isInteger(v) ? "0.00" : NUM, font: { bold: k === "採用人数" } });
    ws.mergeCells(`C${n}:G${n}`); cell(row.getCell(3), { font: { size: 9, color: { argb: "FF475467" } } });
    n++;
  });
  n++;

  section("STEP 4　金額に落とす");
  ws.getRow(n).values = ["項目", "算出元", "内訳", null, null, null, null, null, "金額（円・税抜）"];
  ws.mergeCells(`C${n}:H${n}`); head(ws.getRow(n), 1, 9); n++;
  const s4 = n;
  r.lines.forEach(l => {
    const row = ws.getRow(n);
    row.getCell(1).value = l.name; row.getCell(2).value = l.src; row.getCell(3).value = l.detail; row.getCell(9).value = l.amount;
    ws.mergeCells(`C${n}:H${n}`);
    cell(row.getCell(1), { font: { bold: true } }); cell(row.getCell(2), { h: "center" });
    for (let k = 3; k <= 8; k++) cell(row.getCell(k), { wrap: true, font: { size: 9, color: { argb: "FF475467" } } });
    cell(row.getCell(9), { fmt: NUM });
    fitHeight(row, l.detail, 72, 9);
    n++;
  });
  const t4 = ws.getRow(n);
  t4.getCell(1).value = "小計（税抜）"; t4.getCell(9).value = { formula: `SUM(I${s4}:I${n - 1})`, result: r.subtotal };
  ws.mergeCells(`A${n}:H${n}`);
  for (let k = 1; k <= 9; k++) cell(t4.getCell(k), { font: { bold: true }, fill: "FFF2F4F7", fmt: k === 9 ? NUM : undefined, h: k === 1 ? "right" : undefined });
}

/* ============ 料金マスタ ============ */
function buildMasterBook(wb){
  const sheet = (name, widths, heads, rows, fmts = {}) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }],
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = widths.map(width => ({ width }));
    title(ws, "A1", name, `出力日時 ${nowStr()}`);
    ws.getRow(3).values = heads; head(ws.getRow(3), 1, heads.length); ws.getRow(3).height = 30;
    rows.forEach((v, i) => {
      const row = ws.getRow(4 + i); row.values = v;
      for (let c = 1; c <= heads.length; c++) cell(row.getCell(c), { fmt: fmts[c], wrap: true });
    });
    return ws;
  };
  sheet("品目マスタ", [8, 30, 12, 12, 15, 11, 15],
    ["区分", "品目", "容積（m³）", "重量（kg）", "設置時間（分）", "必要人数", "人時換算（分）"],
    ITEMS.map((i, n) => [i.cat, i.name, i.m3, i.kg, i.min, i.crew, { formula: `E${4 + n}*F${4 + n}`, result: i.min * i.crew }]),
    { 3: "0.00", 4: NUM, 5: NUM, 6: NUM, 7: NUM });
  sheet("車両マスタ", [14, 22, 26, 20],
    ["車格", "荷台の積載容積（m³）", `実効容積（m³・効率${Math.round(RATES.loadEfficiency * 100)}%）`, "最大積載重量（kg）"],
    VEHICLES.map(v => [v.name, v.m3, +(v.m3 * RATES.loadEfficiency).toFixed(1), v.kg]), { 2: "0.0", 3: "0.0", 4: NUM });
  const M = masterSnapshot();
  const base = sheet("基準値", [28, 14, 14, 44], ["項目", "設定値", "単位", "使いみち"],
    [...BASE_FIELDS.map(f => [f.label, getP(M, f.path), f.pct ? "" : f.unit, f.note]),
     ["タリフ適用エリア", areaText(TARIFF_AREAS), "", "到着地がこのエリア内ならタリフ、外なら実績ベースで推定"]]);
  BASE_FIELDS.forEach((f, i) => {
    const v = getP(M, f.path);
    base.getCell(`B${4 + i}`).numFmt = f.pct ? "0.0%" : Number.isInteger(v) ? NUM : "0.00";
  });
  const CO = { SITE_FLOOR, ROAD_WIDTH, SEASON, PARTNERS };
  sheet("作業係数", [18, 30, 10], ["区分", "設定値", "係数"],
    CO_GROUPS.flatMap(([t, key]) => Object.entries(CO[key]).map(([k, v]) => [t, k, v])), { 3: "0.00" });
  const bands = TARIFF["4t車"].map(b => `〜${b[0]}km`);
  sheet("車両タリフ", [14, ...bands.map(() => 12)], ["車格（円／台）", ...bands],
    Object.entries(TARIFF).map(([v, rows]) => [v, ...rows.map(r => r[1])]),
    Object.fromEntries(bands.map((_, i) => [i + 2, NUM])));
  sheet("変更履歴", [17, 14, 44, 18, 18], ["日時", "変更者", "項目", "変更前", "変更後"],
    masterHistory.flatMap(h => h.changes.map(c => [h.at, h.who, c.label, c.before, c.after])));
}

/* ---- ボタン ---- */
$("btn-deals-xlsx").onclick = e => exportXlsx(`案件管理表_${ymd()}.xlsx`, buildDealsBook, e.currentTarget);
$("btn-sheet-xlsx").onclick = e => {
  if (!lastSheet) { toast("先に「見積作成」で算出し、「この内容で見積書を作成」を押してください"); return; }
  exportXlsx(`御見積書_${lastSheet.no}.xlsx`, wb => buildQuoteBook(wb, lastSheet), e.currentTarget);
};
$("btn-logic-xlsx").onclick = e => exportXlsx(`料金マスタ_${ymd()}.xlsx`, buildMasterBook, e.currentTarget);
