import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getDatabase,ref,onValue,set,update,remove} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {CONFIG} from "./config.js";

const CATS=[["Pizza","pizza_restaurant"],["Chinese","chinese_restaurant"],["Steakhouse","steak_house"],["Mexican","mexican_restaurant"],["Italian","italian_restaurant"],["Burgers","hamburger_restaurant"],["Sushi","sushi_restaurant"],["Japanese","japanese_restaurant"],["Thai","thai_restaurant"],["Indian","indian_restaurant"],["Seafood","seafood_restaurant"],["BBQ","barbecue_restaurant"],["American","american_restaurant"],["Breakfast","breakfast_restaurant"],["Sandwiches","sandwich_shop"],["Mediterranean","mediterranean_restaurant"],["Korean","korean_restaurant"],["Vietnamese","vietnamese_restaurant"],["Vegetarian","vegetarian_restaurant"],["Fast food","fast_food_restaurant"],["Coffee","coffee_shop"],["Bakery","bakery"],["Ice cream","ice_cream_shop"],["Bar & grill","bar_and_grill"]];
const PRICE={PRICE_LEVEL_INEXPENSIVE:"$",PRICE_LEVEL_MODERATE:"$$",PRICE_LEVEL_EXPENSIVE:"$$$",PRICE_LEVEL_VERY_EXPENSIVE:"$$$$"};
const $=s=>document.querySelector(s), main=$("#main");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=localStorage.ds_uid||(localStorage.ds_uid=crypto.randomUUID().slice(0,12));
let db,code=localStorage.ds_room||"",room={},view="",picked=new Set(JSON.parse(localStorage.ds_cats||"[]")),miles=+(localStorage.ds_miles||5),busy=false,err="",favs={},onlyFavs=localStorage.ds_only==="1",favFirst=localStorage.ds_first!=="0";

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
try{db=getDatabase(initializeApp(CONFIG.FIREBASE))}catch(e){err="Add your Firebase settings to config.js."}

/* ---------- joining a room ---------- */
function joinRoom(c){
  code=c.toUpperCase().replace(/[^A-Z0-9]/g,"");localStorage.ds_room=code;
  $("#roomPill").hidden=false;$("#roomPill").textContent="Room "+code;
  $("#roomPill").onclick=()=>{navigator.clipboard?.writeText(code);$("#roomPill").textContent="Copied!";setTimeout(()=>$("#roomPill").textContent="Room "+code,1200)};
  onValue(ref(db,"favorites/"+code),s=>{favs=s.val()||{};document.querySelectorAll(".heart").forEach(paintHeart);if($("#find")&&!busy)setupScreen()});
  onValue(ref(db,"rooms/"+code),s=>{room=s.val()||{};if(!room.places)view="setup";else if(view==="setup"&&!busy&&room.places&&view!=="forceSetup")view="";render()});
}
const epoch=()=>room.epoch||0;
const placesArr=()=>(room.places?Object.values(room.places):[]);
const votesOf=u=>(room.votes?.[epoch()]?.[u])||{};
const keys=o=>Object.keys(o||{});

/* ---------- round logic ---------- */
function compute(){
  let pool=placesArr(),k=1;
  const others=keys(room.votes?.[epoch()]).filter(u=>u!==uid), o=others[0];
  for(;;){
    const a=votesOf(uid)[k]||{},b=o?(votesOf(o)[k]||{}):{};
    if(!pool.every(p=>a.s?.[p.id])) return {state:"swipe",k,pool,a};
    if(!o||!pool.every(p=>b.s?.[p.id])) return {state:"wait",k,partner:!!o};
    const m=pool.filter(p=>a.l?.[p.id]&&b.l?.[p.id]);
    if(!m.length) return {state:"none",k};
    if(m.length===1) return {state:"win",win:m[0]};
    pool=m;k++;if(k>6) return {state:"stuck",pool};
  }
}
function vote(k,id,like){
  const base=`rooms/${code}/votes/${epoch()}/${uid}/${k}/`, u={[base+"s/"+id]:true};
  if(like)u[base+"l/"+id]=true;
  update(ref(db),u);
}

/* ---------- Google Places search ---------- */
function here(){return new Promise((res,rej)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(p=>res(p.coords),()=>rej(new Error("Location is blocked. Allow location for this site, then try again.")),{enableHighAccuracy:true,timeout:15000}):rej(new Error("This browser can't share location.")))}
const dist=(a,b,c,d)=>{const R=3958.8,r=Math.PI/180,x=(c-a)*r,y=(d-b)*r,h=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h))};
const FIELDS="id,displayName,primaryTypeDisplayName,rating,userRatingCount,priceLevel,location,photos,googleMapsUri,businessStatus,currentOpeningHours.openNow";
const isOpen=p=>p.businessStatus==="OPERATIONAL"&&p.currentOpeningHours?.openNow===true; // open-now is always required
const toPlace=(p,pos)=>({id:p.id,n:p.displayName?.text||"Unnamed",t:p.primaryTypeDisplayName?.text||"Food",r:p.rating||0,rc:p.userRatingCount||0,pr:PRICE[p.priceLevel]||"",
  ph:p.photos?.[0]?.name||"",uri:p.googleMapsUri||"",mi:+dist(pos.latitude,pos.longitude,p.location.latitude,p.location.longitude).toFixed(1)});
async function findPlaces(cats,mi,pos){
  const mask=FIELDS.split(",").map(f=>"places."+f).join(",");
  const lists=await Promise.all(cats.map(async t=>{
    const r=await fetch("https://places.googleapis.com/v1/places:searchNearby",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":CONFIG.PLACES_KEY,"X-Goog-FieldMask":mask},
      body:JSON.stringify({includedTypes:[t],maxResultCount:20,rankPreference:"POPULARITY",locationRestriction:{circle:{center:{latitude:pos.latitude,longitude:pos.longitude},radius:Math.min(mi*1609.34,50000)}}})});
    const j=await r.json();if(j.error)throw new Error(j.error.message);return j.places||[]}));
  const seen=new Set(),out=[];
  for(let i=0;i<20;i++)for(const l of lists){const p=l[i];if(!p||seen.has(p.id)||!isOpen(p))continue;seen.add(p.id);out.push(toPlace(p,pos))}
  return out;
}
async function findFavorites(mi,pos){
  const res=await Promise.all(keys(favs).slice(0,40).map(id=>fetch("https://places.googleapis.com/v1/places/"+id,{headers:{"X-Goog-Api-Key":CONFIG.PLACES_KEY,"X-Goog-FieldMask":FIELDS}}).then(r=>r.json()).catch(()=>null)));
  return res.filter(p=>p&&p.id&&p.location&&isOpen(p)).map(p=>toPlace(p,pos)).filter(p=>p.mi<=mi);
}
async function runSearch(){
  err="";busy=true;render();
  try{
    const pos=await here();let found;
    if(onlyFavs)found=await findFavorites(miles,pos);
    else{found=await findPlaces([...picked],miles,pos);
      if(favFirst)found.sort((x,y)=>(favs[y.id]?1:0)-(favs[x.id]?1:0))}
    found=found.slice(0,40);
    if(!found.length)throw new Error(onlyFavs?"None of your favorites are open within "+miles+" mile"+(miles>1?"s":"")+" right now.":"Nothing open nearby right now. Try more categories or a bigger radius.");
    await set(ref(db,"rooms/"+code),{epoch:epoch()+1,places:found,search:{cats:[...picked],miles,onlyFavs}});
    view="";
  }catch(e){err=e.message}
  busy=false;render();
}
function paintHeart(b){const on=!!favs[b.dataset.fav];b.textContent=on?"★":"☆";b.setAttribute("aria-pressed",on);b.setAttribute("aria-label",on?"Remove from favorites":"Save as favorite")}
function bindHearts(){main.querySelectorAll(".heart").forEach(b=>{paintHeart(b);b.onpointerdown=e=>e.stopPropagation();
  b.onclick=()=>{const id=b.dataset.fav,p=placesArr().find(x=>x.id===id);if(!p)return;
    favs[id]?remove(ref(db,`favorites/${code}/${id}`)):set(ref(db,`favorites/${code}/${id}`),{n:p.n,t:p.t,pr:p.pr,ph:p.ph,uri:p.uri})}})}

/* ---------- screens ---------- */
function render(){
  if(!db){main.innerHTML=`<div class="center"><p class="err">${esc(err)}</p></div>`;return}
  if(!code)return joinScreen();
  if(view==="setup"||view==="forceSetup"||!room.places)return setupScreen();
  const s=compute();
  if(s.state==="swipe")return swipeScreen(s);
  if(s.state==="wait")main.innerHTML=`<div class="center stack"><h2>You're done with this round</h2><p class="mut">${s.partner?"Waiting for your partner to finish swiping…":"Share room code <b>"+code+"</b> so your partner can join."}</p><div><button id="ns">New search</button></div></div>`;
  else if(s.state==="win")winScreen(s.win);
  else main.innerHTML=`<div class="center stack"><h2>${s.state==="none"?"No places you both liked":"Still tied"}</h2><p class="mut">${s.state==="none"?"Try different categories or a wider radius.":"Let fate pick between these."}</p>${s.pool?`<ul class="list">${s.pool.map(p=>`<li>${esc(p.n)}</li>`).join("")}</ul><button id="rnd" class="primary">Pick for us</button>`:""}<div><button id="ns">New search</button></div></div>`;
  $("#ns")&&($("#ns").onclick=()=>{view="forceSetup";render()});
  $("#rnd")&&($("#rnd").onclick=()=>winScreen(s.pool[Math.floor(Math.random()*s.pool.length)]));
}
function joinScreen(){
  main.innerHTML=`<div class="center stack"><h2>Who's eating tonight?</h2><p class="mut">Pick any room code and both of you enter it on your phones.</p><input id="c" maxlength="6" placeholder="CODE" autocomplete="off"><button class="primary" id="go">Join room</button></div>`;
  $("#go").onclick=()=>{const v=$("#c").value.replace(/[^A-Za-z0-9]/g,"");if(v.length>=3){joinRoom(v);view="";render()}};
}
function setupScreen(){
  main.innerHTML=`<h2>What are you in the mood for?</h2><div class="chips" ${onlyFavs?'style="opacity:.4;pointer-events:none"':""}>${CATS.map(([l,t])=>`<button class="chip" data-t="${t}" aria-pressed="${picked.has(t)}">${l}</button>`).join("")}</div>
  <label class="opt"><input type="checkbox" id="of" ${onlyFavs?"checked":""}> Only my favorites (${keys(favs).length} saved)</label>
  <label class="opt"><input type="checkbox" id="ff" ${favFirst?"checked":""} ${onlyFavs?"disabled":""}> Show favorites first</label>
  <label class="mut">How far?<select id="mi">${[1,2,5,10,25].map(m=>`<option ${m===miles?"selected":""} value="${m}">${m} mile${m>1?"s":""} from where I am now</option>`).join("")}</select></label>
  <p class="err">${esc(err)}</p><button class="primary" id="find" ${busy||(onlyFavs?!keys(favs).length:!picked.size)?"disabled":""}>${busy?"Finding places…":"Find places"}</button>
  ${room.places?`<div class="row"><button id="back">Back to swiping</button></div>`:""}`;
  main.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{const t=b.dataset.t;picked.has(t)?picked.delete(t):picked.add(t);localStorage.ds_cats=JSON.stringify([...picked]);b.setAttribute("aria-pressed",picked.has(t));$("#find").disabled=busy||!picked.size});
  $("#mi").onchange=e=>{miles=+e.target.value;localStorage.ds_miles=miles};
  $("#of").onchange=e=>{onlyFavs=e.target.checked;localStorage.ds_only=onlyFavs?"1":"0";setupScreen()};
  $("#ff").onchange=e=>{favFirst=e.target.checked;localStorage.ds_first=favFirst?"1":"0"};
  $("#find").onclick=runSearch;$("#back")&&($("#back").onclick=()=>{view="";render()});
}
const card=(p,c)=>`<div class="card ${c}" ${c==="top"?'id="tc"':""}><div class="stamp y">YUM</div><div class="stamp n">NOPE</div><button class="heart" data-fav="${p.id}"></button>
  <div class="photo" style="${p.ph?`background-image:url('https://places.googleapis.com/v1/${p.ph}/media?maxWidthPx=700&key=${CONFIG.PLACES_KEY}')`:""}">${p.ph?"":"🍽️"}</div>
  <div class="info"><div class="name">${esc(p.n)}</div><div class="mut">${esc(p.t)}${p.pr?" · "+p.pr:""}${p.r?" · ★ "+p.r+" ("+p.rc+")":""}</div><div class="mut">${p.mi} mi away · Open now</div></div></div>`;
function swipeScreen(s){
  const left=s.pool.filter(p=>!s.a.s?.[p.id]),p=left[0],nx=left[1];
  main.innerHTML=`<div class="mut" style="text-align:center">Round ${s.k} · ${left.length} left</div><div class="deck">${nx?card(nx,"back"):""}${card(p,"top")}</div><div class="btns"><button class="n" id="bn" aria-label="Nope">✕</button><button class="y" id="by" aria-label="Yum">♥</button></div>`;
  const el=$("#tc");let x0=null,dx=0;
  const fly=like=>{el.style.transition="transform .25s";el.style.transform=`translateX(${like?600:-600}px) rotate(${like?30:-30}deg)`;setTimeout(()=>vote(s.k,p.id,like),220)};
  el.onpointerdown=e=>{x0=e.clientX;el.setPointerCapture(e.pointerId);el.style.transition="none"};
  el.onpointermove=e=>{if(x0===null)return;dx=e.clientX-x0;el.style.transform=`translateX(${dx}px) rotate(${dx/15}deg)`;el.querySelector(".y").style.opacity=Math.max(0,dx/100);el.querySelector(".n").style.opacity=Math.max(0,-dx/100)};
  el.onpointerup=()=>{if(x0===null)return;x0=null;if(dx>90)fly(true);else if(dx<-90)fly(false);else{el.style.transition="transform .2s";el.style.transform="";el.querySelectorAll(".stamp").forEach(t=>t.style.opacity=0)}dx=0};
  bindHearts();$("#by").onclick=()=>fly(true);$("#bn").onclick=()=>fly(false);
}
function winScreen(w){
  main.innerHTML=`<div class="center stack"><h2>You're eating at</h2><div class="deck" style="min-height:300px">${card(w,"top").replace('id="tc"',"")}</div>
  <a href="${esc(w.uri)}" target="_blank" rel="noopener"><button class="primary">Get directions</button></a><div><button id="ns">New search</button></div></div>`;
  $("#ns").onclick=()=>{view="forceSetup";render()};bindHearts();
}
if(code&&db)joinRoom(code);
render();
