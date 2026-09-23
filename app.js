/* ===== 画面制御 ===== */
const $ = id => document.getElementById(id);
let current = null, adjustRate = 0, deals = [...INITIAL_DEALS], seq = 60;
let lines = [{ id:"tv-55", qty:50 }];

function go(p){
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on", b.dataset.p===p));
  document.querySelectorAll(".page").forEach(s=>s.classList.toggle("on", s.id==="p-"+p));
  window.scrollTo(0,0);
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>go(b.dataset.p));

/* ---- 入力欄 ---- */
const fillSel=(id,keys,def)=>{ $(id).innerHTML = keys.map(k=>`<option${k===def?" selected":""}>${k}</option>`).join(""); };
fillSel("i-from", Object.keys(CITIES), "東京");
fillSel("i-to",   Object.keys(CITIES), "横浜");
fillSel("i-floor", Object.keys(SITE_FLOOR), "2階以上・エレベーターあり");
fillSel("i-road",  Object.keys(ROAD_WIDTH), "4m以上（大型可）");
fillSel("i-season",Object.keys(SEASON), "通常期");
fillSel("i-partner",Object.keys(PARTNERS), "自社便");

$("preset-row").innerHTML = Object.entries(PRESETS)
  .map(([k,p])=>`<button data-k="${k}">${p.label}</button>`).join("");
$("preset-row").onclick = e => {
  const k = e.target.dataset.k; if(!k) return;
  const p = PRESETS[k];
  lines = p.lines.map(l=>({...l}));
  $("i-from").value=p.from; $("i-to").value=p.to; $("i-floor").value=p.floor;
  $("i-road").value=p.road; $("i-days").value=p.days; $("i-recycle").checked=p.recycle;
  renderLines(); refreshKm();
};

function refreshKm(){
  const km = distanceKm($("i-from").value, $("i-to").value);
  $("i-km").textContent = km ? km.toLocaleString() : "－";
  const area = CITIES[$("i-to").value].area;
  const covered = TARIFF_AREAS.includes(area) && km <= TARIFF_MAX_KM;
  $("i-area").innerHTML = area + (covered
    ? ' <span class="pill rule">タリフ対応</span>' : ' <span class="pill ai">タリフ外→実績推定</span>');
}
$("i-from").onchange = $("i-to").onchange = refreshKm;

/* ---- 荷物明細 ---- */
function renderLines(){
  const opts = ["家電","家具","什器"].map(c=>
    `<optgroup label="${c}">` + ITEMS.filter(i=>i.cat===c).map(i=>`<option value="${i.id}">${i.name}</option>`).join("") + `</optgroup>`).join("");
  $("line-rows").innerHTML = lines.map((l,i)=>`<tr>
    <td><select data-i="${i}" class="l-id">${opts}</select></td>
    <td><input type="number" class="l-qty" data-i="${i}" value="${l.qty}" min="1" max="9999"></td>
    <td><button class="del" data-i="${i}" title="削除">×</button></td></tr>`).join("");
  lines.forEach((l,i)=>{ $("line-rows").querySelectorAll(".l-id")[i].value = l.id; });
  $("line-rows").querySelectorAll(".l-id").forEach(s=>s.onchange=e=>{ lines[+e.target.dataset.i].id=e.target.value; updTotals(); });
  $("line-rows").querySelectorAll(".l-qty").forEach(s=>s.oninput=e=>{ lines[+e.target.dataset.i].qty=+e.target.value||0; updTotals(); });
  $("line-rows").querySelectorAll(".del").forEach(b=>b.onclick=e=>{
    if(lines.length<=1) return; lines.splice(+e.target.dataset.i,1); renderLines(); });
  updTotals();
}
function updTotals(){
  const s = summarize(lines);
  $("line-totals").innerHTML =
    `<span>合計台数 <b>${fmt(s.qty)}</b> 台</span>
     <span>総容積 <b>${s.m3.toFixed(1)}</b> m³</span>
     <span>総重量 <b>${fmt(s.kg)}</b> kg</span>
     <span>設置人時 <b>${fmt(s.setupMin)}</b> 分</span>`;
}
$("btn-addline").onclick = () => { lines.push({id:"ref-s", qty:1}); renderLines(); };
renderLines(); refreshKm();

/* ---- 算出 ---- */
$("btn-calc").onclick = () => {
  if($("i-from").value===$("i-to").value){ alert("出発地と到着地が同じです。"); return; }
  const r = estimate({
    lines, from:$("i-from").value, to:$("i-to").value,
    floor:$("i-floor").value, road:$("i-road").value, season:$("i-season").value,
    partner:$("i-partner").value, days:+$("i-days").value||1,
    recycle:$("i-recycle").checked, highway:$("i-highway").checked });
  if(!r){ alert("荷物明細を1件以上入力してください。"); return; }
  adjustRate = 0; current = r; renderResult(); renderBasis();
};

const pill = s => s==="実績推定" ? '<span class="pill ai">実績推定</span>'
  : s==="補正" ? '<span class="pill adj">補正</span>'
  : s==="実費" ? '<span class="pill jit">実費</span>' : '<span class="pill rule">タリフ</span>';

function renderResult(){
  const r = current;
  const adj = Math.round(r.subtotal * adjustRate/100);
  const after = r.subtotal + adj, tax = Math.round(after*0.1), grand = after + tax;
  Object.assign(r, { adj, after, tax, grand });

  $("result").innerHTML = `
    <div class="big2">
      <div><div class="l">必要な車両</div><div class="n">${r.vehicle.v.name} × ${r.units}台</div>
        <div class="s">${r.unitsDriver}で決定／1台あたり ${r.vehicle.cap}m³・${fmt(r.vehicle.v.kg)}kg</div></div>
      <div class="o"><div class="l">必要な作業人数</div><div class="n">${r.crewPlan.crew}名 × ${r.input.days}日</div>
        <div class="s">${r.crewPlan.reason}で決定／補正後 ${fmt(r.crewPlan.adjMin)}人時分</div></div>
    </div>
    <div class="card">
      <div class="total-head">
        <div><div style="font-size:11.5px;opacity:.85;margin-bottom:4px">御見積金額（税込）</div>
          <div class="amt">¥${fmt(grand)}</div>
          <div class="tax">税抜 ¥${fmt(after)}　／　消費税 ¥${fmt(tax)}</div></div>
        <div class="meta">${r.input.from} → ${r.input.to}（${fmt(r.km)}km）<br>
          荷物 ${fmt(r.sum.qty)}台／${r.sum.m3.toFixed(1)}m³／${fmt(r.sum.kg)}kg<br>
          ${r.input.floor} ／ ${r.input.season}</div>
      </div>
      <div class="conf">
        <b style="color:var(--navy);font-size:12px">算出の内訳（タリフ ／ 実績推定）</b>
        <div class="bar"><i class="r" style="width:${r.ruleShare}%">${r.ruleShare>12?"タリフ "+r.ruleShare+"%":""}</i>
          <i class="a" style="width:${r.aiShare}%">${r.aiShare>12?"実績推定 "+r.aiShare+"%":""}</i></div>
        <small>${r.aiShare===0 ? "全額がタリフと係数で算出されています。担当者が変わっても同じ金額になります。"
          : "オレンジ部分はタリフ外エリアのため実績ベースの推定です。営業担当者による最終調整をおすすめします。"}</small>
      </div>
      <table><thead><tr><th>項目</th><th class="ctr" style="width:90px">算出元</th><th class="num" style="width:110px">金額（税抜）</th></tr></thead>
        <tbody>${r.lines.map(l=>`<tr><td><b>${l.name}</b><span class="dt">${l.detail}</span></td>
          <td class="ctr">${pill(l.src)}</td><td class="num">${fmt(l.amount)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><td colspan="2">小計</td><td class="num">${fmt(r.subtotal)}</td></tr>
          ${adj!==0?`<tr><td colspan="2">営業調整（${adjustRate>0?"+":""}${adjustRate}%）</td><td class="num">${fmt(adj)}</td></tr>`:""}
          <tr><td colspan="2">合計（税抜）</td><td class="num">${fmt(after)}</td></tr></tfoot></table>
      <div class="adjust">
        <b>営業担当者による調整</b>
        <input type="range" id="adj" min="-20" max="20" step="1" value="${adjustRate}" style="width:180px">
        <span id="adj-v" style="font-weight:bold;color:var(--orange);width:46px">${adjustRate>0?"+":""}${adjustRate}%</span>
        <span style="color:var(--gray);font-size:11.5px">「もう少し取れるか」「安くしないと取れないか」の調整は記録に残ります</span>
        <button class="solid" id="btn-fix" style="margin-left:auto">この内容で見積書を作成</button>
      </div>
    </div>
    <div class="basis"><h4>算出の考え方</h4>
      <p>荷物明細から総容積 <b>${r.sum.m3.toFixed(1)}m³</b>・総重量 <b>${fmt(r.sum.kg)}kg</b> を求め、
      積載効率${Math.round(LOAD_EFFICIENCY*100)}%を見込んで車両台数を決定。設置人時と荷降ろし人時に納品先条件の係数を掛けて必要人数を算出しています。
      詳しい途中経過は「② 積載・人員の算出根拠」でご確認いただけます。</p>
      <button class="ghost" onclick="go('basis')">算出根拠を見る</button></div>`;
  $("adj").oninput = e => { adjustRate = +e.target.value; renderResult(); $("adj").focus(); };
  $("btn-fix").onclick = fixQuote;
}

/* ---- ② 算出根拠 ---- */
function renderBasis(){
  const r = current, c = r.crewPlan;
  $("basis-area").innerHTML = `
  <div class="calcbox"><h4>STEP 1　荷物明細から積載量を求める</h4>
    <table><thead><tr><th>品目</th><th class="num">台数</th><th class="num">容積計</th><th class="num">重量計</th><th class="num">設置人時</th></tr></thead>
      <tbody>${r.sum.detail.map(d=>`<tr><td>${d.name}<span class="dt">${(d.m3/d.qty).toFixed(2)}m³・${Math.round(d.kg/d.qty)}kg・${Math.round(d.min/d.qty)}人時分／台（${d.crew}名作業）</span></td>
        <td class="num">${fmt(d.qty)}</td><td class="num">${d.m3.toFixed(2)} m³</td>
        <td class="num">${fmt(d.kg)} kg</td><td class="num">${fmt(d.min)} 分</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>合計</td><td class="num">${fmt(r.sum.qty)}</td><td class="num">${r.sum.m3.toFixed(2)} m³</td>
        <td class="num">${fmt(r.sum.kg)} kg</td><td class="num">${fmt(r.sum.setupMin)} 分</td></tr></tfoot></table></div>

  <div class="calcbox"><h4>STEP 2　必要な車両台数を決める</h4>
    <p style="font-size:12px;margin:0 0 8px">容積で必要な台数と重量で必要な台数を両方出し、<b>大きい方</b>を採用します。
      前面道幅「${r.input.road}」で入れる車格に限定しています。</p>
    <table><thead><tr><th>車格</th><th class="num">積載容積<br>（効率${Math.round(LOAD_EFFICIENCY*100)}%）</th><th class="num">最大積載</th>
      <th class="num">容積で必要</th><th class="num">重量で必要</th><th class="ctr">採用台数</th><th class="num">運賃／台</th><th class="num">運賃計</th></tr></thead>
      <tbody>${r.options.map(o=>`<tr class="${o.v.name===r.vehicle.v.name?"winner":""}">
        <td>${o.v.name}</td><td class="num">${o.cap} m³</td><td class="num">${fmt(o.v.kg)} kg</td>
        <td class="num">${o.byVol} 台</td><td class="num">${o.byWt} 台</td>
        <td class="ctr"><b>${o.units}</b> 台</td><td class="num">${fmt(o.fare)}</td><td class="num">${fmt(o.total)}</td></tr>`).join("")}</tbody></table>
    <div class="formula">総容積 ${r.sum.m3.toFixed(2)}m³ ÷ (${r.vehicle.v.m3}m³ × ${LOAD_EFFICIENCY}) = <em>${r.vehicle.byVol}台</em>　／　
      総重量 ${fmt(r.sum.kg)}kg ÷ ${fmt(r.vehicle.v.kg)}kg = <em>${r.vehicle.byWt}台</em><br>
      作業員${c.crew}名の乗車に必要な台数 = ${Math.ceil(c.crew/WORK.maxCrewPerVehicle)}台（1台あたり最大${WORK.maxCrewPerVehicle}名）<br>
      → 採用：<em>${r.vehicle.v.name} × ${r.units}台</em>（${r.unitsDriver}で決定／運賃合計が最小の車格を選択）</div></div>

  <div class="calcbox"><h4>STEP 3　必要な作業人数を決める</h4>
    <div class="formula">
      設置人時　　　${fmt(r.sum.setupMin)} 分（品目ごとの標準時間 × 必要人数 × 台数）<br>
      荷降ろし人時　${fmt(c.unloadMin)} 分（総容積 ${r.sum.m3.toFixed(2)}m³ × ${WORK.unloadMinPerM3}分/m³）<br>
      小計　　　　　${fmt(c.baseMin)} 分<br>
      納品先条件　　× ${c.floorCoef.toFixed(2)}（${r.input.floor}）<br>
      前面道幅　　　× ${c.roadCoef.toFixed(2)}（${r.input.road}）<br>
      補正後　　　　<em>${fmt(c.adjMin)} 人時分</em><br>
      1名あたりの稼働　${WORK.shiftMinutes}分 × ${r.input.days}日 = ${fmt(c.capacity)} 分<br>
      作業量から　　${fmt(c.adjMin)} ÷ ${fmt(c.capacity)} = <em>${c.byWorkload}名</em>　／　
      品目の最低人数 <em>${c.minCrew}名</em>（2名作業が必要な品目を含む）<br>
      → 採用：<em>${c.crew}名</em>（${c.reason}で決定）</div></div>

  <div class="calcbox"><h4>STEP 4　金額に落とす</h4>
    <table><thead><tr><th>項目</th><th class="ctr" style="width:90px">算出元</th><th class="num" style="width:110px">金額（税抜）</th></tr></thead>
      <tbody>${r.lines.map(l=>`<tr><td><b>${l.name}</b><span class="dt">${l.detail}</span></td>
        <td class="ctr">${pill(l.src)}</td><td class="num">${fmt(l.amount)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">小計（税抜）</td><td class="num">${fmt(r.subtotal)}</td></tr></tfoot></table></div>`;
}

/* ---- 見積確定 ---- */
function fixQuote(){
  const r = current; seq += 3;
  r.no = "Q-2026-" + String(seq).padStart(4,"0");
  r.date = new Date().toISOString().slice(0,10);
  const top = r.sum.detail.slice().sort((a,b)=>b.qty-a.qty)[0];
  deals.unshift({ no:r.no, date:r.date, customer:"（お客様名を入力してください）",
    route:`${r.input.from} → ${r.input.to}`,
    summary:`${top.name} ${top.qty}台${r.sum.detail.length>1?" ほか":""}`,
    total:r.grand, status:"作成中", owner:"営業1課 佐藤" });
  renderDeals(); renderSheet(); go("sheet");
}

function renderSheet(){
  const r = current; if(!r || !r.no) return;
  $("sheet-area").innerHTML = `<div class="sheet">
    <h1>御 見 積 書</h1>
    <div class="top">
      <div class="to"><div class="cust">（お客様名）　御中</div>
        <div style="font-size:11.5px;color:#555">下記のとおりお見積り申し上げます。</div>
        <div class="grand"><span>御見積金額</span><span>¥${fmt(r.grand)} －</span></div>
        <table style="font-size:11px;width:auto">
          <tr><td style="border:0;padding:2px 12px 2px 0">見積番号</td><td style="border:0;padding:2px 0"><b>${r.no}</b></td></tr>
          <tr><td style="border:0;padding:2px 12px 2px 0">発行日</td><td style="border:0;padding:2px 0">${r.date}</td></tr>
          <tr><td style="border:0;padding:2px 12px 2px 0">有効期限</td><td style="border:0;padding:2px 0">発行日より30日間</td></tr>
        </table></div>
      <div class="from"><b style="font-size:13px">サンプル物流サービス株式会社</b><br>
        〒000-0000　○○県○○市○○町0-0-0<br>TEL 000-000-0000 ／ FAX 000-000-0000<br>担当：営業1課　佐藤<br><br>
        <span style="border:1px solid #C33;color:#C33;padding:8px 14px;border-radius:50%;font-size:10px">印</span></div>
    </div>
    <table><thead><tr><th style="width:150px">品名・項目</th><th>仕様・内訳</th><th class="num" style="width:100px">金額（円）</th></tr></thead>
      <tbody>${r.lines.map(l=>`<tr><td>${l.name}</td><td style="font-size:10.5px;color:#666">${l.detail}</td>
        <td class="num">${fmt(l.amount)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">小計</td><td class="num">${fmt(r.subtotal)}</td></tr>
        ${r.adj!==0?`<tr><td colspan="2">お値引き・調整</td><td class="num">${fmt(r.adj)}</td></tr>`:""}
        <tr><td colspan="2">消費税（10%）</td><td class="num">${fmt(r.tax)}</td></tr>
        <tr><td colspan="2">合計金額</td><td class="num">${fmt(r.grand)}</td></tr></tfoot></table>
    <div class="note">
      ■ 運行区間：${r.input.from} → ${r.input.to}（約${fmt(r.km)}km）　■ 車両：${r.vehicle.v.name} ${r.units}台<br>
      ■ 荷物：${r.sum.detail.map(d=>`${d.name} ${d.qty}台`).join("／")}（計 ${r.sum.m3.toFixed(1)}m³・${fmt(r.sum.kg)}kg）<br>
      ■ 作業：${r.crewPlan.crew}名 × ${r.input.days}日　■ 納品先：${r.input.floor}／前面道幅 ${r.input.road}<br>
      ■ 高速道路料金は実績に基づき精算させていただく場合がございます。<br>
      ■ 本デモはサンプルデータによる出力例です。実在の企業・料金とは関係ありません。</div></div>`;
}

/* ---- 案件管理表 ---- */
function renderDeals(){
  const st = s => s==="受注"?'<span class="pill ok">受注</span>' : s==="失注"?'<span class="pill ng">失注</span>'
    : s==="提出済"?'<span class="pill rule">提出済</span>' : '<span class="pill wip">作成中</span>';
  $("deal-rows").innerHTML = deals.map(d=>`<tr><td><b>${d.no}</b></td><td>${d.date}</td><td>${d.customer}</td>
    <td>${d.route}</td><td>${d.summary}</td><td class="num">¥${fmt(d.total)}</td>
    <td class="ctr">${st(d.status)}</td><td>${d.owner}</td></tr>`).join("");
  const won = deals.filter(d=>d.status==="受注"), sum = deals.reduce((s,d)=>s+d.total,0);
  $("deal-kpi").innerHTML = `
    <div><div class="n">${deals.length}</div><div class="l">登録案件数</div></div>
    <div class="o"><div class="n">¥${fmt(sum)}</div><div class="l">見積金額 合計</div></div>
    <div class="g"><div class="n">${won.length}</div><div class="l">受注済</div></div>
    <div><div class="n">${deals.length?Math.round(won.length/deals.length*100):0}%</div><div class="l">受注率</div></div>`;
}

/* ---- 料金ロジック ---- */
function renderLogic(){
  $("item-tbl").innerHTML = `<thead><tr><th>区分</th><th>品目</th><th class="num">容積</th><th class="num">重量</th>
    <th class="num">設置時間</th><th class="ctr">必要人数</th><th class="num">人時換算</th></tr></thead><tbody>` +
    ITEMS.map(i=>`<tr><td>${i.cat}</td><td><b>${i.name}</b></td><td class="num">${i.m3.toFixed(2)} m³</td>
      <td class="num">${i.kg} kg</td><td class="num">${i.min} 分</td><td class="ctr">${i.crew} 名</td>
      <td class="num">${i.min*i.crew} 人時分</td></tr>`).join("") + `</tbody>`;

  $("veh-tbl").innerHTML = `<thead><tr><th>車格</th><th class="num">荷台の積載容積</th><th class="num">実効容積（効率${Math.round(LOAD_EFFICIENCY*100)}%）</th>
    <th class="num">最大積載重量</th><th class="ctr">乗車可能な作業員</th></tr></thead><tbody>` +
    VEHICLES.map(v=>`<tr><td><b>${v.name}</b></td><td class="num">${v.m3.toFixed(1)} m³</td>
      <td class="num">${(v.m3*LOAD_EFFICIENCY).toFixed(1)} m³</td><td class="num">${fmt(v.kg)} kg</td>
      <td class="ctr">最大${WORK.maxCrewPerVehicle}名</td></tr>`).join("") + `</tbody>`;

  const co = (t,obj)=>Object.entries(obj).map((e,i)=>
    `<tr>${i===0?`<td rowspan="${Object.keys(obj).length}"><b>${t}</b></td>`:""}<td>${e[0]}</td><td class="ctr">×${e[1].toFixed(2)}</td></tr>`).join("");
  $("coef-tbl").innerHTML = `<thead><tr><th style="width:190px">区分</th><th>設定値</th><th class="ctr" style="width:90px">係数</th></tr></thead><tbody>`
    + co("納品先の条件", SITE_FLOOR) + co("前面道幅", ROAD_WIDTH) + co("時期", SEASON) + co("パートナー企業", PARTNERS)
    + `<tr><td><b>基準値</b></td><td>荷降ろし ${WORK.unloadMinPerM3}分/m³ ／ 1名の稼働 ${WORK.shiftMinutes}分/日 ／ 作業単価 ${fmt(WORK.laborRate)}円/人時</td><td class="ctr">－</td></tr></tbody>`;

  const bands = TARIFF["4t車"].map(b=>`〜${b[0]}km`);
  $("tariff-tbl").innerHTML = `<thead><tr><th>車格</th>${bands.map(b=>`<th class="num">${b}</th>`).join("")}</tr></thead><tbody>`
    + Object.entries(TARIFF).map(([v,rows])=>`<tr><td><b>${v}</b></td>${rows.map(r=>`<td class="num">${fmt(r[1])}</td>`).join("")}</tr>`).join("")
    + `</tbody>`;
}

/* ---- ばらつき分析 ---- */
function renderVariance(){
  $("var-cond").innerHTML = `<b>比較条件：</b>${VARIANCE.condition}`;
  const spread = a => { const v=a.map(x=>x.amount); return Math.round((Math.max(...v)-Math.min(...v))/(v.reduce((s,n)=>s+n,0)/v.length)*1000)/10; };
  const sb = spread(VARIANCE.before), sa = spread(VARIANCE.after);
  $("var-kpi").innerHTML = `
    <div style="border-top-color:var(--red)"><div class="n" style="color:var(--red)">±${sb}%</div><div class="l">導入前のばらつき幅</div></div>
    <div class="g"><div class="n">±${sa}%</div><div class="l">導入後のばらつき幅</div></div>
    <div class="o"><div class="n">${Math.round((1-sa/sb)*100)}%</div><div class="l">ばらつきの縮小率</div></div>
    <div><div class="n">30分 → 6分</div><div class="l">1件あたり作成時間（目標）</div></div>`;
  const max = Math.max(...VARIANCE.before.map(x=>x.amount), ...VARIANCE.after.map(x=>x.amount));
  const bars = (arr,cls)=>arr.map(x=>`<div class="vbar ${cls}"><span class="nm">${x.who}</span>
    <span class="tr"><span class="fl" style="width:${x.amount/max*100}%"></span></span>
    <span class="vl">¥${fmt(x.amount)}</span></div>`).join("");
  const mn = a=>Math.min(...a.map(x=>x.amount)), mx = a=>Math.max(...a.map(x=>x.amount));
  $("var-before").innerHTML = bars(VARIANCE.before,"bef") +
    `<div style="margin-top:10px;font-size:11.5px;color:var(--gray)">同じ条件で最大 ¥${fmt(mx(VARIANCE.before)-mn(VARIANCE.before))} の差が出ています</div>`;
  $("var-after").innerHTML = bars(VARIANCE.after,"aft") +
    `<div style="margin-top:10px;font-size:11.5px;color:var(--gray)">差が残るのは営業担当者が案件状況に応じて調整した分のみ。調整の理由と金額はログに残ります。</div>`;
}

renderDeals(); renderLogic(); renderVariance();
