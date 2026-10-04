(()=>{
const ENC_URL='data/job-data.enc.json';
let state={roles:[],studios:[],activity:[],meta:{}};
let view='dashboard',query='';
const $=s=>document.querySelector(s), enc=new TextEncoder(), dec=new TextDecoder();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function badge(t,c=''){return `<span class="badge ${c}">${esc(t)}</span>`}
function statusBadge(s){return badge(s,'s-'+slug(s))}
function fitBadge(s){return s?badge(s,'b-'+slug(s)):''}
function age(d){if(!d)return '—';const a=new Date(d+'T12:00:00'),b=new Date();b.setHours(12,0,0,0);return Math.max(0,Math.floor((b-a)/86400000))+'d'}
function score(r){let n=0;n+=({Critical:50,High:35,Normal:20,Low:5}[r.priority]||10);n+=({Strong:25,Good:15,Stretch:5}[r.fit]||0);if(r.geo==='Seattle area')n+=8;if(r.geo==='Remote')n+=6;if(r.status==='Not applied')n+=12;if(r.track==='Bridge')n-=6;return n}
function searchable(r){return [r.company,r.position,r.team,r.location,r.status,r.fit,r.notes,r.evidence].join(' ').toLowerCase()}
async function decryptData(password,payload){
  const keyMaterial=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(payload.salt),iterations:payload.iterations,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['decrypt']);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(payload.iv)},key,b64(payload.ciphertext));
  return JSON.parse(dec.decode(plain));
}
async function unlock(pw){
  $('#unlockError').textContent='';
  try{
    const r=await fetch(ENC_URL,{cache:'no-store'}); if(!r.ok)throw new Error('load');
    state=await decryptData(pw,await r.json());
    if(!Array.isArray(state.roles)||!Array.isArray(state.studios))throw new Error('data');
    sessionStorage.setItem('jobHuntMagicKey',pw);
    $('#lockScreen').hidden=true;
    $('#appShell').hidden=false;
    history.replaceState(null,'',location.pathname+location.search);
    bind();
    render();
  }catch(e){
    $('#accessMessage').textContent='Could not open the private dashboard.';
    $('#unlockError').textContent='This access link is invalid or the encrypted data could not be loaded.';
  }
}
function bind(){
  document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===b));render()});
  $('#globalSearch').oninput=e=>{query=e.target.value.toLowerCase();render()};
  $('#lockBtn').onclick=()=>{sessionStorage.removeItem('jobHuntMagicKey');history.replaceState(null,'',location.pathname+location.search);location.reload()};
  $('#themeBtn').onclick=()=>document.documentElement.classList.toggle('light');
  $('#exportBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='job-hunt-data.json';a.click()};
}
function metric(l,v,n,hot=false){return `<div class="metric${hot?' hot':''}"><div class="lab">${l}</div><div class="val">${v}</div><div class="note">${n}</div></div>`}
function priorityRoles(){return state.roles.filter(r=>r.status==='Not applied').sort((a,b)=>score(b)-score(a))}
function card(r){return `<article class="priority-card" data-role="${esc(r.id)}"><div><h3>${esc(r.company)} · ${esc(r.position)}</h3><p>${esc(r.team||r.location||'')}${r.salary?' · '+esc(r.salary):''}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${fitBadge(r.fit)}${badge(r.track||'Target')}${r.geo?badge(r.geo):''}</div></div><div class="score">${score(r)}</div></article>`}
function dashboard(){const c={};state.roles.forEach(r=>c[r.status]=(c[r.status]||0)+1);const pri=priorityRoles();return `<div class="metric-grid">${metric('Roles tracked',state.roles.length,'canonical records')}${metric('Need applying',c['Not applied']||0,'verified & unsent',true)}${metric('Out for response',(c.Applied||0)+(c['Awaiting response']||0),'submitted')}${metric('Rejected',c.Rejected||0,'closed out')}${metric('Studios',state.studios.length,'boards in sweep')}</div><div class="panel"><div class="panel-head"><div><div class="eyebrow">DO NEXT</div><h2>Highest-value applications</h2></div></div><div class="priority-list">${pri.slice(0,8).map(card).join('')||'<div class="empty">No unsent priority roles.</div>'}</div></div>`}
function priority(){const rows=priorityRoles().filter(r=>!query||searchable(r).includes(query));return `<div class="kanban"><div class="lane critical"><h2>Apply first</h2>${rows.filter(r=>r.priority==='Critical').map(card).join('')}</div><div class="lane high"><h2>High value</h2>${rows.filter(r=>r.priority==='High').map(card).join('')}</div><div class="lane bridge"><h2>Secondary / bridge</h2>${rows.filter(r=>!['Critical','High'].includes(r.priority)).map(card).join('')}</div></div>`}
function applications(){let rows=state.roles.filter(r=>!query||searchable(r).includes(query));rows.sort((a,b)=>score(b)-score(a)||(b.applied||'').localeCompare(a.applied||''));return `<div class="tablewrap"><table><thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Fit</th><th>Applied</th><th>Age</th><th>Location</th><th>Salary</th><th>Next</th></tr></thead><tbody>${rows.map(r=>`<tr data-id="${esc(r.id)}"><td class="company">${esc(r.company)}</td><td>${esc(r.position)}</td><td>${statusBadge(r.status)}</td><td>${fitBadge(r.fit)}</td><td>${esc(r.applied||'—')}</td><td>${age(r.applied)}</td><td>${esc(r.location||'—')}</td><td>${esc(r.salary||'—')}</td><td>${esc(r.nextAction||'—')}</td></tr>`).join('')}</tbody></table></div>`}
function studios(){let rows=state.studios.filter(s=>!query||[s.co,s.ats,s.status,s.signal,s.notes].join(' ').toLowerCase().includes(query));return `<div class="studio-grid">${rows.map(s=>`<article class="studio"><div class="panel-head"><h3>${esc(s.co)}</h3>${badge(s.cadence||'')}</div><div class="studio-meta">${badge(s.priority||'')}${badge(s.status||'')}</div><p class="signal">${esc(s.signal||'No current signal recorded.')}</p><p>${esc(s.notes||'')}</p>${s.board?`<a href="${esc(s.board)}" target="_blank" rel="noopener">Open career board ↗</a>`:''}<p>Last checked: ${esc(s.last||'—')} · ${esc(s.ats||'')}</p></article>`).join('')}</div>`}
function activity(){const rows=[...(state.activity||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<div class="panel"><div class="timeline">${rows.map(e=>`<div class="event"><div class="date">${esc(e.date)}</div><div class="actor">${esc(e.actor)}</div><div><strong>${esc(e.type||'Update')}</strong> ${esc(e.summary)}</div></div>`).join('')}</div></div>`}
function openRole(id){const r=state.roles.find(x=>x.id===id);if(!r)return;$('#detailEyebrow').textContent=r.company;$('#detailTitle').textContent=r.position;$('#detailBody').innerHTML=`<div class="detail-grid"><div class="field"><label>Status</label>${esc(r.status)}</div><div class="field"><label>Fit</label>${esc(r.fit||'—')}</div><div class="field"><label>Team</label>${esc(r.team||'—')}</div><div class="field"><label>Location</label>${esc(r.location||'—')}</div><div class="field"><label>Salary</label>${esc(r.salary||'—')}</div><div class="field"><label>Applied</label>${esc(r.applied||'—')}</div><div class="field full"><label>Next action</label>${esc(r.nextAction||'—')}</div><div class="field full"><label>Evidence</label>${esc(r.evidence||'—')}</div><div class="field full"><label>Notes</label>${esc(r.notes||'—')}</div>${r.link?`<div class="field full"><label>Posting</label><a href="${esc(r.link)}" target="_blank" rel="noopener">Open posting ↗</a></div>`:''}</div>`;$('#detailDialog').showModal()}
const titles={dashboard:['Dashboard','What matters now, across the entire search.'],priority:['Priority Queue','Verified opportunities you have not applied to.'],applications:['Applications','Evidence-backed application state across both inboxes.'],studios:['Studio Sweep','The actual career boards — not just LinkedIn.'],activity:['Activity','What changed, who changed it, and why.']};
function render(){const t=titles[view];$('#viewTitle').textContent=t[0];$('#viewSub').textContent=t[1];$('#priorityBadge').textContent=priorityRoles().length;$('#syncMini').innerHTML=`<b>${esc(state.meta?.version||'1.0')}</b><br>${state.roles.length} roles · ${state.studios.length} studios`;$('#view').innerHTML=view==='dashboard'?dashboard():view==='priority'?priority():view==='applications'?applications():view==='studios'?studios():activity();document.querySelectorAll('[data-id],[data-role]').forEach(el=>el.onclick=()=>openRole(el.dataset.id||el.dataset.role))}
const magicKey=decodeURIComponent(location.hash.slice(1))||sessionStorage.getItem('jobHuntMagicKey')||'';
if(magicKey){unlock(magicKey)}else{$('#accessMessage').textContent='This dashboard opens from your private access link.';$('#unlockError').textContent='Private key missing from this URL.';}
})();