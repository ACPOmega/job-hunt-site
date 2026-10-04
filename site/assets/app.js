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
const TARGET_COMP=Number(state.meta?.targetComp||185000),CONTRACT_PARITY=Number(state.meta?.contractParityHourly||88.94);
function moneyValues(s){return (String(s||'').match(/\$\s?[\d,.]+/g)||[]).map(x=>Number(x.replace(/[$,\s]/g,''))).filter(Number.isFinite)}
function scoreDetails(r){
  const fitMap={Strong:30,Good:24,Moderate:20,Possible:16,Fair:14,Stretch:10,Weak:4};
  const fit=fitMap[r.fit]??12;

  let comp=10,compNote='Comp unclear';
  const vals=moneyValues(r.salary), hourly=/\/\s*(hr|hour)|per hour|\/hr/i.test(String(r.salary||''));
  if(vals.length){
    const lo=Math.min(...vals),hi=Math.max(...vals);
    if(hourly){
      if(hi>=CONTRACT_PARITY*1.15){comp=20;compNote='Hourly ceiling well above parity'}
      else if(hi>=CONTRACT_PARITY){comp=16;compNote='Hourly ceiling clears parity'}
      else if(hi>=CONTRACT_PARITY*.9){comp=9;compNote='Hourly ceiling slightly below parity'}
      else{comp=3;compNote='Hourly band materially below parity'}
    }else{
      if(hi>=TARGET_COMP*1.35){comp=20;compNote='Band strongly clears target'}
      else if(hi>=TARGET_COMP*1.15){comp=18;compNote='Band clears target with room'}
      else if(hi>=TARGET_COMP){comp=15;compNote='Band can clear target'}
      else if(hi>=TARGET_COMP*.9){comp=8;compNote='Band tops slightly below target'}
      else{comp=3;compNote='Band materially below target'}
      if(lo>=TARGET_COMP)comp=Math.min(20,comp+2);
    }
  }else if(/not posted|not stated|not disclosed|unknown/i.test(String(r.salary||''))){comp=8;compNote='Comp not posted'}

  const title=String(r.position||'').toLowerCase();
  const track=String(r.track||'');
  let career=track==='Target'?10:track==='Bridge'?5:track==='Stretch'?7:track==='Pass'||track==='Closed'?0:7;
  if(/head|vice president|\bvp\b|executive producer|director/.test(title))career+=5;
  else if(/principal|staff|lead/.test(title))career+=4;
  else if(/senior/.test(title))career+=2;
  career=Math.min(15,career);

  let access=4,accessNote='Cold application';
  if(String(r.referral||'').trim()){access=15;accessNote='Referral / internal advocate'}
  else if(String(r.recruiter||'').trim()){access=12;accessNote='Known recruiter / human path'}
  else if(/inbound|referral/i.test(String(r.via||''))){access=11;accessNote='Warm or inbound path'}

  const geoMap={'Remote':10,'Remote US':10,'Seattle area':10,'Washington':10,'California':8,'Domestic':7,'TBD':5,'Unknown':5,'Elsewhere':2,'Canada':1,'Europe':1};
  const geo=geoMap[r.geo]??(/remote/i.test(String(r.location||''))?10:/seattle|redmond|bellevue|renton/i.test(String(r.location||''))?10:/\bCA\b|california|los angeles|san diego|san mateo|irvine|culver city|santa monica/i.test(String(r.location||''))?8:5);

  let fresh=5,freshNote='Age unknown';
  const blob=[r.evidence,r.notes].join(' ');
  const iso=blob.match(/(?:first[_ ]published|published|posted(?:Date)?)[^\d]*(2026-\d{2}-\d{2})/i);
  if(iso){
    const ageDays=Math.max(0,Math.floor((new Date('2026-10-04T12:00:00')-new Date(iso[1]+'T12:00:00'))/86400000));
    fresh=ageDays<=7?10:ageDays<=14?9:ageDays<=30?7:ageDays<=45?5:ageDays<=90?3:1;
    freshNote=ageDays+' days old';
  }else if(r.live===true){fresh=7;freshNote='Marked live'}
  if(/needs liveness check/i.test(blob)){fresh=Math.min(fresh,3);freshNote='Needs direct liveness check'}
  if(/pulled|filled|no longer available|dead req|closed before/i.test(blob)){fresh=0;freshNote='Likely closed / pulled'}

  let modifier=0,mods=[];
  if(track==='Bridge'){modifier-=4;mods.push('Bridge role −4')}
  if(track==='Deprioritized on comp'||track==='Low priority'){modifier-=6;mods.push('Deprioritized −6')}
  if(/hard gate|wrong discipline|do not apply|candidate-ownership|duplicate application|two hard gates/i.test(blob)){modifier-=15;mods.push('Material gate −15')}
  if(/below target|under target|below parity/i.test(String(r.notes||''))&&comp<=8){modifier-=3;mods.push('Comp concern −3')}
  const total=Math.max(0,Math.min(100,fit+comp+career+access+geo+fresh+modifier));
  return {total,fit,comp,career,access,geo,fresh,modifier,compNote,accessNote,freshNote,mods};
}
function score(r){return scoreDetails(r).total}
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
function isActionable(r){return r.status==='Not applied'&&!['Pass','Closed'].includes(String(r.track||''))&&!['Dead','Passed','Duplicate'].includes(String(r.status||''))}
function priorityRoles(){return state.roles.filter(isActionable).sort((a,b)=>score(b)-score(a))}
function activeProcesses(){return state.roles.filter(r=>r.status==='Interviewing').sort((a,b)=>(a.nextDue||'9999').localeCompare(b.nextDue||'9999'))}
function card(r){const d=scoreDetails(r);return `<article class="priority-card" data-role="${esc(r.id)}"><div><h3>${esc(r.company)} · ${esc(r.position)}</h3><p>${esc(r.team||r.location||'')}${r.salary?' · '+esc(r.salary):''}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${fitBadge(r.fit)}${badge(r.track||'Target')}${r.geo?badge(r.geo):''}</div></div><div class="score" title="Opportunity Priority Score"><span>Priority Score</span><b>${d.total}</b></div></article>`}
function processCard(r){return `<article class="priority-card process-card" data-role="${esc(r.id)}"><div><h3>${esc(r.company)} · ${esc(r.position)}</h3><p>${esc(r.nextAction||r.team||'Active interview process')}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${statusBadge(r.status)}${r.nextDue?badge('Due '+r.nextDue):''}${r.recruiter?badge('Human contact'):''}</div></div><div class="process-mark">ACTIVE</div></article>`}
function dashboard(){const c={};state.roles.forEach(r=>c[r.status]=(c[r.status]||0)+1);const pri=priorityRoles(),active=activeProcesses();return `<div class="metric-grid">${metric('Roles tracked',state.roles.length,'canonical records')}${metric('Need applying',pri.length,'actionable & unsent',true)}${metric('Active processes',active.length,'interviewing now',active.length>0)}${metric('Out for response',(c.Applied||0)+(c['Awaiting response']||0),'submitted')}${metric('Rejected',c.Rejected||0,'closed out')}${metric('Studios',state.studios.length,'boards in sweep')}</div>${active.length?`<div class="panel active-panel"><div class="panel-head"><div><div class="eyebrow">ACTIVE PROCESSES</div><h2>Protect the things already moving</h2></div></div><div class="priority-list">${active.map(processCard).join('')}</div></div>`:''}<div class="panel"><div class="panel-head"><div><div class="eyebrow">DO NEXT</div><h2>Highest-value applications</h2></div></div><div class="priority-list">${pri.slice(0,8).map(card).join('')||'<div class="empty">No unsent priority roles.</div>'}</div></div>`}
function priority(){
  const rows=priorityRoles().filter(r=>!query||searchable(r).includes(query));
  const first=rows.slice(0,5);
  const firstIds=new Set(first.map(r=>r.id));
  const high=rows.filter(r=>!firstIds.has(r.id)&&(r.priority==='High'||score(r)>=60)).slice(0,10);
  const highIds=new Set(high.map(r=>r.id));
  const rest=rows.filter(r=>!firstIds.has(r.id)&&!highIds.has(r.id));
  const empty='<div class="empty">No roles in this lane.</div>';
  return `<div class="kanban"><div class="lane critical"><h2>Apply first</h2>${first.map(card).join('')||empty}</div><div class="lane high"><h2>High value</h2>${high.map(card).join('')||empty}</div><div class="lane bridge"><h2>Secondary / bridge</h2>${rest.map(card).join('')||empty}</div></div>`;
}
function applications(){let rows=state.roles.filter(r=>!query||searchable(r).includes(query));rows.sort((a,b)=>score(b)-score(a)||(b.applied||'').localeCompare(a.applied||''));return `<div class="tablewrap"><table><thead><tr><th>Company</th><th>Role</th><th>Status</th><th>Fit</th><th>Applied</th><th>Age</th><th>Location</th><th>Salary</th><th>Next</th></tr></thead><tbody>${rows.map(r=>`<tr data-id="${esc(r.id)}"><td class="company">${esc(r.company)}</td><td>${esc(r.position)}</td><td>${statusBadge(r.status)}</td><td>${fitBadge(r.fit)}</td><td>${esc(r.applied||'—')}</td><td>${age(r.applied)}</td><td>${esc(r.location||'—')}</td><td>${esc(r.salary||'—')}</td><td>${esc(r.nextAction||'—')}</td></tr>`).join('')}</tbody></table></div>`}
function studios(){let rows=state.studios.filter(s=>!query||[s.co,s.ats,s.status,s.signal,s.notes].join(' ').toLowerCase().includes(query));return `<div class="studio-grid">${rows.map(s=>`<article class="studio"><div class="panel-head"><h3>${esc(s.co)}</h3>${badge(s.cadence||'')}</div><div class="studio-meta">${badge(s.priority||'')}${badge(s.status||'')}</div><p class="signal">${esc(s.signal||'No current signal recorded.')}</p><p>${esc(s.notes||'')}</p>${s.board?`<a href="${esc(s.board)}" target="_blank" rel="noopener">Open career board ↗</a>`:''}<p>Last checked: ${esc(s.last||'—')} · ${esc(s.ats||'')}</p></article>`).join('')}</div>`}
function activity(){const rows=[...(state.activity||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<div class="panel"><div class="timeline">${rows.map(e=>`<div class="event"><div class="date">${esc(e.date)}</div><div class="actor">${esc(e.actor)}</div><div><strong>${esc(e.type||'Update')}</strong> ${esc(e.summary)}</div></div>`).join('')}</div></div>`}
function openRole(id){const r=state.roles.find(x=>x.id===id);if(!r)return;const d=scoreDetails(r),showScore=r.status==='Not applied';$('#detailEyebrow').textContent=r.company;$('#detailTitle').textContent=r.position;$('#detailBody').innerHTML=`<div class="detail-grid"><div class="field"><label>Status</label>${esc(r.status)}</div><div class="field"><label>Fit</label>${esc(r.fit||'—')}</div><div class="field"><label>Team</label>${esc(r.team||'—')}</div><div class="field"><label>Location</label>${esc(r.location||'—')}</div><div class="field"><label>Salary</label>${esc(r.salary||'—')}</div><div class="field"><label>Applied</label>${esc(r.applied||'—')}</div>${showScore?`<div class="field full score-breakdown"><label>Opportunity Priority Score · ${d.total}/100</label><div class="score-grid"><span>Role Fit <b>${d.fit}/30</b></span><span>Compensation <b>${d.comp}/20</b></span><span>Career Value <b>${d.career}/15</b></span><span>Access & Signal <b>${d.access}/15</b></span><span>Geography <b>${d.geo}/10</b></span><span>Freshness & Liveness <b>${d.fresh}/10</b></span></div><p>${esc(d.compNote)} · ${esc(d.accessNote)} · ${esc(d.freshNote)}${d.mods.length?' · '+esc(d.mods.join(', ')):''}</p></div>`:''}<div class="field full"><label>Next action</label>${esc(r.nextAction||'—')}</div>${r.referral?`<div class="field full"><label>Referral</label>${esc(r.referral)}</div>`:''}${r.recruiter?`<div class="field full"><label>Recruiter / contact</label>${esc(r.recruiter)}</div>`:''}<div class="field full"><label>Evidence</label>${esc(r.evidence||'—')}</div><div class="field full"><label>Notes</label>${esc(r.notes||'—')}</div>${r.link?`<div class="field full"><label>Posting</label><a href="${esc(r.link)}" target="_blank" rel="noopener">Open posting ↗</a></div>`:''}</div>`;$('#detailDialog').showModal()}
const titles={dashboard:['Dashboard','What matters now, across the entire search.'],priority:['Priority Queue','Verified opportunities you have not applied to.'],applications:['Applications','Evidence-backed application state across both inboxes.'],studios:['Studio Sweep','The actual career boards — not just LinkedIn.'],activity:['Activity','What changed, who changed it, and why.']};
function render(){const t=titles[view];$('#viewTitle').textContent=t[0];$('#viewSub').textContent=t[1];$('#priorityBadge').textContent=priorityRoles().length;$('#syncMini').innerHTML=`<b>${esc(state.meta?.version||'1.0')}</b><br>${state.roles.length} roles · ${state.studios.length} studios`;$('#view').innerHTML=view==='dashboard'?dashboard():view==='priority'?priority():view==='applications'?applications():view==='studios'?studios():activity();document.querySelectorAll('[data-id],[data-role]').forEach(el=>el.onclick=()=>openRole(el.dataset.id||el.dataset.role))}
const magicKey=decodeURIComponent(location.hash.slice(1))||sessionStorage.getItem('jobHuntMagicKey')||'';
if(magicKey){unlock(magicKey)}else{$('#accessMessage').textContent='This dashboard opens from your private access link.';$('#unlockError').textContent='Private key missing from this URL.';}
})();