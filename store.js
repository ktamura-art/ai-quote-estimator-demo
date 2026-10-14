/* ===== 保存と共通部品 =====
   デモでは変更内容をこのブラウザ内（localStorage）にだけ保存します。
   本番ではサーバーのデータベースに保存し、編集できる人を管理者に限定します。 */

const STORE = { master: "aqe-master-v1", deals: "aqe-deals-v1" };
const store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const nowStr = () => { const d = new Date(); return `${today()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

/* ---- マスタ一式（品目・車両・係数・タリフ・基準値）---- */
const MASTER_KEYS = ["ITEMS","VEHICLES","WORK","SITE_FLOOR","ROAD_WIDTH","SEASON","PARTNERS","TARIFF","TARIFF_AREAS","RATES"];
function masterSnapshot(){
  return clone({ ITEMS, VEHICLES, WORK, SITE_FLOOR, ROAD_WIDTH, SEASON, PARTNERS, TARIFF, TARIFF_AREAS, RATES });
}
function applyMaster(m){
  ITEMS.splice(0, ITEMS.length, ...clone(m.ITEMS));
  Object.keys(ITEM_BY_ID).forEach(k => delete ITEM_BY_ID[k]);
  ITEMS.forEach(i => { ITEM_BY_ID[i.id] = i; });
  VEHICLES.splice(0, VEHICLES.length, ...clone(m.VEHICLES));
  TARIFF_AREAS.splice(0, TARIFF_AREAS.length, ...m.TARIFF_AREAS);
  const objs = { WORK, SITE_FLOOR, ROAD_WIDTH, SEASON, PARTNERS, TARIFF, RATES };
  for (const [k, o] of Object.entries(objs)) {
    Object.keys(o).forEach(x => delete o[x]);
    Object.assign(o, clone(m[k]));
  }
}
const DEFAULT_MASTER = masterSnapshot();
let masterHistory = [];
(function loadMaster(){
  const s = store.get(STORE.master);
  if (!s || !s.data || !MASTER_KEYS.every(k => k in s.data)) return;
  try { applyMaster(s.data); masterHistory = Array.isArray(s.history) ? s.history : []; }
  catch(e){ applyMaster(DEFAULT_MASTER); }
})();
function saveMaster(){ return store.set(STORE.master, { data: masterSnapshot(), history: masterHistory }); }

/* ---- 案件管理表 ---- */
function loadDeals(){
  const s = store.get(STORE.deals);
  return s && Array.isArray(s.deals) && Number.isFinite(s.seq) ? s : null;
}

/* ---- 画面下の通知 ---- */
function toast(msg){
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div"); t.id = "toast"; t.className = "toast";
    t.setAttribute("role", "status"); document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 3600);
}
