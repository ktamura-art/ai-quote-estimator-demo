/* ===== 画面制御 ===== */
const $ = id => document.getElementById(id);
let current = null;            // 現在の見積結果
let adjustRate = 0;            // 営業調整（％）
let deals = [...INITIAL_DEALS];
let seq = 60;

function go(p){
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on", b.dataset.p===p));
  document.querySelectorAll(".page").forEach(s=>s.classList.toggle("on", s.id==="p-"+p));
  window.scrollTo(0,0);
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>go(b.dataset.p));

/* ---- 入力欄の初期化 ---- */
function fillSel(id, keys, def){
  const s = $(id);
  s.innerHTML = keys.map(k=>`<option${k===def?" selected":""}>${k}</option>`).join("");
}
const cityNames = Object.keys(CITIES);
fillSel("i-from", cityNames, "東京");
fillSel("i-to", cityNames, "仙台");
fillSel("i-vehicle", Object.keys(TARIFF), "4t");
fillSel("i-work", Object.keys(WORK_TYPES), "配送＋設置");
fillSel("i-road", Object.keys(ROAD_WIDTH), "3〜4m（中型まで）");
fillSel("i-season", Object.keys(SEASON), "通常期");
fillSel("i-partner", Object.keys(PARTNERS), "自社便");

function refreshKm(){
  const f=$("i-from").value, t=$("i-to").value;
  const km = distanceKm(f,t);
  $("i-km").textContent = km ? km.toLocaleString() : "－";
  const area = CITIES[t] ? CITIES[t].area : "－";
  const covered = TARIFF_AREAS.includes(area) && km<=TARIFF_MAX_KM;
  $("i-area").innerHTML = area + (covered
    ? ' <span class="pill rule">タリフ対応</span>'
    : ' <span class="pill ai">タリフ外→AI推定</span>');
}
$("i-from").onchange = $("i-to").onchange = refreshKm;
refreshKm();

/* ---- 算出 ---- */
$("btn-calc").onclick = () => {
  const from=$("i-from").value, to=$("i-to").value;
  if(from===to){ alert("出発地と到着地が同じです。"); return; }
  const input = {
    from, to, area: CITIES[to].area, km: distanceKm(from,to),
    vehicle: $("i-vehicle").value, units: +$("i-units").value||1,
    work: $("i-work").value, workers: +$("i-workers").value||1,
    road: $("i-road").value, season: $("i-season").value, partner: $("i-partner").value,
    waitHours: +$("i-wait").value||0, highway: $("i-highway").checked
  };
  adjustRate = 0;
  current = estimate(input);
  renderResult();
};

/* ---- 結果表示 ---- */
function renderResult(){
  const r = current;
  const adjAmt = Math.round(r.subtotal * adjustRate / 100);
  const afterAdj = r.subtotal + adjAmt;
  const tax = Math.round(afterAdj * 0.1);
  const grand = afterAdj + tax;
  r.afterAdj = afterAdj; r.tax = tax; r.grand = grand; r.adjAmt = adjAmt;

  const srcPill = s => s==="AI推定" ? '<span class="pill ai">AI推定</span>'
    : s==="補正" ? '<span class="pill adj">補正</span>'
    : s==="実費" ? '<span class="pill jit">実費</span>'
    : '<span class="pill rule">タリフ</span>';

  const rows = r.lines.map(l=>`<tr>
      <td><b>${l.name}</b><span class="dt">${l.detail}</span></td>
      <td class="ctr">${srcPill(l.src)}</td>
      <td class="num">${fmt(l.amount)}</td></tr>`).join("");

  const refTable = r.basis.refs.length ? `
    <table style="margin-top:8px">
      <thead><tr><th>見積No</th><th>区間</th><th class="ctr">車格</th><th class="num">距離</th><th>作業内容</th><th class="num">km単価</th><th class="ctr">類似度</th></tr></thead>
      <tbody>${r.basis.refs.map(q=>`<tr>
        <td>${q.no}</td><td>${q.from} → ${q.to}</td><td class="ctr">${q.vehicle}</td>
        <td class="num">${fmt(q.distance)}km</td><td>${q.work}</td>
        <td class="num">${fmt(q.kmUnit)}円</td><td class="ctr"><b>${q.score}%</b></td></tr>`).join("")}</tbody>
    </table>` : "";

  $("result").innerHTML = `
    <div class="card">
      <div class="total-head">
        <div>
          <div style="font-size:11.5px;opacity:.85;margin-bottom:4px">御見積金額（税込）</div>
          <div class="amt">¥${fmt(grand)}</div>
          <div class="tax">税抜 ¥${fmt(afterAdj)}　／　消費税 ¥${fmt(tax)}</div>
        </div>
        <div class="meta">
          ${r.input.from} → ${r.input.to}（${fmt(r.input.km)}km）<br>
          ${r.input.vehicle}車 ${r.input.units}台 ／ ${r.input.work} ／ 作業${r.input.workers}名<br>
          ${r.input.season} ／ 前面道幅 ${r.input.road} ／ ${r.input.partner}
        </div>
      </div>
      <div class="conf">
        <b style="color:var(--navy);font-size:12px">算出の内訳（第1層タリフ ／ 第2層AI推定）</b>
        <div class="bar">
          <i class="r" style="width:${r.ruleShare}%">${r.ruleShare>12?"確定ルール "+r.ruleShare+"%":""}</i>
          <i class="a" style="width:${r.aiShare}%">${r.aiShare>12?"AI推定 "+r.aiShare+"%":""}</i>
        </div>
        <small>${r.aiShare===0
          ? "全額がタリフ（確定ルール）で算出されています。担当者が変わっても同じ金額になります。"
          : "オレンジ部分は過去実績からのAI推定です。営業担当者による最終調整をおすすめします。"}</small>
      </div>
      <table>
        <thead><tr><th>項目</th><th class="ctr" style="width:90px">算出元</th><th class="num" style="width:110px">金額（税抜）</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="2">小計</td><td class="num">${fmt(r.subtotal)}</td></tr>
          ${adjAmt!==0?`<tr><td colspan="2">営業調整（${adjustRate>0?"+":""}${adjustRate}%）</td><td class="num">${fmt(adjAmt)}</td></tr>`:""}
          <tr><td colspan="2">合計（税抜）</td><td class="num">${fmt(afterAdj)}</td></tr>
        </tfoot>
      </table>
      <div class="adjust">
        <b>営業担当者による調整</b>
        <input type="range" id="adj" min="-20" max="20" step="1" value="${adjustRate}" style="width:180px">
        <span id="adj-v" style="font-weight:bold;color:var(--orange);width:46px">${adjustRate>0?"+":""}${adjustRate}%</span>
        <span style="color:var(--gray);font-size:11.5px">調整した内容は差分ログに記録され、次回以降の学習データになります</span>
        <button class="solid" id="btn-fix" style="margin-left:auto">この内容で見積書を作成</button>
      </div>
    </div>

    <div class="basis">
      <h4>算出根拠：${r.basis.label}</h4>
      <p>${r.basis.detail}</p>
      ${refTable}
    </div>

    <div class="card">
      <h3>適用した補正係数</h3>
      <table>
        <thead><tr><th>補正項目</th><th>設定値</th><th class="ctr">係数</th></tr></thead>
        <tbody>
          <tr><td>前面道幅（搬入難度）</td><td>${r.input.road}</td><td class="ctr">×${r.coef.road.toFixed(2)}</td></tr>
          <tr><td>時期</td><td>${r.input.season}</td><td class="ctr">×${r.coef.season.toFixed(2)}</td></tr>
          <tr><td>パートナー企業（委託先原価）</td><td>${r.input.partner}</td><td class="ctr">×${r.coef.partner.toFixed(2)}</td></tr>
        </tbody>
      </table>
    </div>`;

  $("adj").oninput = e => {
    adjustRate = +e.target.value;
    renderResult();
    $("adj").focus();
  };
  $("btn-fix").onclick = fixQuote;
}

/* ---- 見積確定 → 帳票＋案件管理表 ---- */
function fixQuote(){
  const r = current;
  seq += 3;
  const no = "Q-2026-" + String(seq).padStart(4,"0");
  r.no = no;
  r.date = new Date().toISOString().slice(0,10);
  deals.unshift({ no, date:r.date, customer:"（お客様名を入力してください）",
    route:`${r.input.from} → ${r.input.to}`, vehicle:r.input.vehicle,
    total:r.grand, status:"作成中", owner:"営業1課 佐藤" });
  ADJ_LOG.unshift({ no, ai:r.subtotal, final:r.afterAdj,
    diff:r.afterAdj-r.subtotal, rate:adjustRate, layer:r.basis.layer==="ai"?"AI推定":"タリフ" });
  renderDeals(); renderSheet(); renderAdjLog();
  go("sheet");
}

/* ---- 見積書 ---- */
function renderSheet(){
  const r = current;
  if(!r || !r.no) return;
  const rows = r.lines.map(l=>`<tr><td>${l.name}</td><td style="font-size:10.5px;color:#666">${l.detail}</td>
    <td class="num">${fmt(l.amount)}</td></tr>`).join("");
  $("sheet-area").innerHTML = `<div class="sheet">
    <h1>御見積書</h1>
    <div class="top">
      <div class="to">
        <div class="cust">（お客様名）　御中</div>
        <div style="font-size:11.5px;color:#555">下記のとおりお見積り申し上げます。</div>
        <div class="grand"><span>御見積金額</span><span>¥${fmt(r.grand)} －</span></div>
        <table style="font-size:11px;width:auto">
          <tr><td style="border:0;padding:2px 12px 2px 0">見積番号</td><td style="border:0;padding:2px 0"><b>${r.no}</b></td></tr>
          <tr><td style="border:0;padding:2px 12px 2px 0">発行日</td><td style="border:0;padding:2px 0">${r.date}</td></tr>
          <tr><td style="border:0;padding:2px 12px 2px 0">有効期限</td><td style="border:0;padding:2px 0">発行日より30日間</td></tr>
        </table>
      </div>
      <div class="from">
        <b style="font-size:13px">サンプル物流サービス株式会社</b><br>
        〒000-0000　○○県○○市○○町0-0-0<br>
        TEL 000-000-0000 ／ FAX 000-000-0000<br>
        担当：営業1課　佐藤<br><br>
        <span style="border:1px solid #C33;color:#C33;padding:8px 14px;border-radius:50%;font-size:10px">印</span>
      </div>
    </div>
    <table>
      <thead><tr><th style="width:150px">品名・項目</th><th>仕様・内訳</th><th class="num" style="width:100px">金額（円）</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="2">小計</td><td class="num">${fmt(r.subtotal)}</td></tr>
        ${r.adjAmt!==0?`<tr><td colspan="2">お値引き・調整</td><td class="num">${fmt(r.adjAmt)}</td></tr>`:""}
        <tr><td colspan="2">消費税（10%）</td><td class="num">${fmt(r.tax)}</td></tr>
        <tr><td colspan="2">合計金額</td><td class="num">${fmt(r.grand)}</td></tr>
      </tfoot>
    </table>
    <div class="note">
      ■ 運行区間：${r.input.from} → ${r.input.to}（約${fmt(r.input.km)}km）　■ 車格・台数：${r.input.vehicle}車 ${r.input.units}台<br>
      ■ 作業内容：${r.input.work}（作業員${r.input.workers}名）　■ 搬入経路 前面道幅：${r.input.road}<br>
      ■ 高速道路料金・待機料は実績に基づき精算させていただく場合がございます。<br>
      ■ 本デモはサンプルデータによる出力例です。実在の企業・料金とは関係ありません。
    </div>
  </div>`;
}

/* ---- 案件管理表 ---- */
function renderDeals(){
  const pill = s => s==="受注" ? '<span class="pill ok">受注</span>'
    : s==="失注" ? '<span class="pill ng">失注</span>'
    : s==="提出済" ? '<span class="pill rule">提出済</span>'
    : '<span class="pill wip">作成中</span>';
  $("deal-rows").innerHTML = deals.map(d=>`<tr>
    <td><b>${d.no}</b></td><td>${d.date}</td><td>${d.customer}</td><td>${d.route}</td>
    <td class="ctr">${d.vehicle}</td><td class="num">¥${fmt(d.total)}</td>
    <td class="ctr">${pill(d.status)}</td><td>${d.owner}</td></tr>`).join("");
  const won = deals.filter(d=>d.status==="受注");
  const sum = deals.reduce((s,d)=>s+d.total,0);
  $("deal-kpi").innerHTML = `
    <div><div class="n">${deals.length}</div><div class="l">登録案件数</div></div>
    <div class="o"><div class="n">¥${fmt(sum)}</div><div class="l">見積金額 合計</div></div>
    <div class="g"><div class="n">${won.length}</div><div class="l">受注済</div></div>
    <div><div class="n">${deals.length?Math.round(won.length/deals.length*100):0}%</div><div class="l">受注率</div></div>`;
}

/* ---- 料金ロジック ---- */
function renderLogic(){
  const bands = TARIFF["4t"].map(b=>`〜${b[0]}km`);
  $("tariff-tbl").innerHTML =
    `<thead><tr><th>車格</th>${bands.map(b=>`<th class="num">${b}</th>`).join("")}</tr></thead><tbody>` +
    Object.entries(TARIFF).map(([v,rows])=>`<tr><td><b>${v}</b></td>${rows.map(r=>`<td class="num">${fmt(r[1])}</td>`).join("")}</tr>`).join("") +
    `</tbody>`;

  $("work-tbl").innerHTML =
    `<thead><tr><th>作業内容</th><th class="num">標準作業時間</th><th class="num">設置・据付費</th><th class="num">回収・処分費</th><th>備考</th></tr></thead><tbody>` +
    Object.entries(WORK_TYPES).map(([k,w])=>`<tr><td><b>${k}</b></td><td class="num">${w.hours}h／台</td>
      <td class="num">${w.setup?fmt(w.setup)+"円":"－"}</td><td class="num">${w.recycle?fmt(w.recycle)+"円":"－"}</td>
      <td>${w.note}</td></tr>`).join("") + `</tbody>`;

  const co = (title, obj) => Object.entries(obj).map((e,i)=>
    `<tr>${i===0?`<td rowspan="${Object.keys(obj).length}"><b>${title}</b></td>`:""}<td>${e[0]}</td><td class="ctr">×${e[1].toFixed(2)}</td></tr>`).join("");
  $("coef-tbl").innerHTML = `<thead><tr><th style="width:170px">区分</th><th>設定値</th><th class="ctr" style="width:90px">係数</th></tr></thead><tbody>`
    + co("前面道幅（搬入難度）", ROAD_WIDTH) + co("時期", SEASON) + co("パートナー企業", PARTNERS) + `</tbody>`;

  $("past-tbl").innerHTML =
    `<thead><tr><th>見積No</th><th>作成日</th><th>区間</th><th>エリア</th><th class="ctr">車格</th><th class="num">距離</th>
     <th>作業内容</th><th class="num">基本運賃</th><th class="num">km単価</th></tr></thead><tbody>` +
    PAST_QUOTES.map(q=>`<tr><td>${q.no}</td><td>${q.date}</td><td>${q.from} → ${q.to}</td><td>${q.area}</td>
      <td class="ctr">${q.vehicle}</td><td class="num">${fmt(q.distance)}km</td><td>${q.work}</td>
      <td class="num">${fmt(q.freight)}</td><td class="num"><b>${fmt(q.kmUnit)}</b></td></tr>`).join("") + `</tbody>`;
}

/* ---- ばらつき分析 ---- */
const ADJ_LOG = [];
[["Q-2026-0044",92300,89600,"タリフ"],["Q-2026-0047",218500,219400,"タリフ"],
 ["Q-2026-0051",579100,562000,"AI推定"],["Q-2026-0055",164200,170400,"AI推定"],
 ["Q-2026-0058",151800,149000,"タリフ"]].forEach(r=>ADJ_LOG.push(
  { no:r[0], ai:r[1], final:r[2], diff:r[2]-r[1], rate:+((r[2]-r[1])/r[1]*100).toFixed(1), layer:r[3] }));

function renderVariance(){
  $("var-cond").innerHTML = `<b>比較条件：</b>${VARIANCE.condition}`;
  const spread = a => { const v=a.map(x=>x.amount); return Math.round((Math.max(...v)-Math.min(...v))/ (v.reduce((s,n)=>s+n,0)/v.length) * 1000)/10; };
  const sb = spread(VARIANCE.before), sa = spread(VARIANCE.after);
  $("var-kpi").innerHTML = `
    <div style="border-top-color:var(--red)"><div class="n" style="color:var(--red)">±${sb}%</div><div class="l">導入前のばらつき幅</div></div>
    <div class="g"><div class="n">±${sa}%</div><div class="l">導入後のばらつき幅</div></div>
    <div class="o"><div class="n">${Math.round((1-sa/sb)*100)}%</div><div class="l">ばらつきの縮小率</div></div>
    <div><div class="n">30分 → 6分</div><div class="l">1件あたり作成時間（目標）</div></div>`;
  const max = Math.max(...VARIANCE.before.map(x=>x.amount), ...VARIANCE.after.map(x=>x.amount));
  const bars = (arr, cls) => arr.map(x=>`<div class="vbar ${cls}"><span class="nm">${x.who}</span>
    <span class="tr"><span class="fl" style="width:${x.amount/max*100}%"></span></span>
    <span class="vl">¥${fmt(x.amount)}</span></div>`).join("");
  $("var-before").innerHTML = bars(VARIANCE.before,"bef") +
    `<div style="margin-top:10px;font-size:11.5px;color:var(--gray)">最大 ¥${fmt(Math.max(...VARIANCE.before.map(x=>x.amount)))} ／ 最小 ¥${fmt(Math.min(...VARIANCE.before.map(x=>x.amount)))}　―　同じ条件で最大 ¥${fmt(Math.max(...VARIANCE.before.map(x=>x.amount))-Math.min(...VARIANCE.before.map(x=>x.amount)))} の差</div>`;
  $("var-after").innerHTML = bars(VARIANCE.after,"aft") +
    `<div style="margin-top:10px;font-size:11.5px;color:var(--gray)">差が残るのは営業担当者が案件状況に応じて調整した分のみ。調整の理由と金額はログに残ります。</div>`;
}
function renderAdjLog(){
  $("adjlog-tbl").innerHTML = `<thead><tr><th>見積No</th><th class="ctr">算出元</th><th class="num">AI提示額(税抜)</th>
    <th class="num">最終提出額(税抜)</th><th class="num">差額</th><th class="num">乖離率</th></tr></thead><tbody>` +
    ADJ_LOG.map(l=>`<tr><td>${l.no}</td>
      <td class="ctr">${l.layer==="AI推定"?'<span class="pill ai">AI推定</span>':'<span class="pill rule">タリフ</span>'}</td>
      <td class="num">${fmt(l.ai)}</td><td class="num">${fmt(l.final)}</td>
      <td class="num" style="color:${l.diff<0?'var(--red)':'var(--green)'}">${l.diff>0?"+":""}${fmt(l.diff)}</td>
      <td class="num">${l.rate>0?"+":""}${l.rate}%</td></tr>`).join("") + `</tbody>`;
}

renderDeals(); renderLogic(); renderVariance(); renderAdjLog();
