(()=>{
const ENC_URL='data/job-data.enc.json';
let state={roles:[],studios:[],activity:[],meta:{}};
let canonicalState=state;
const ROLE_STATUSES=['Not applied','Applied','Awaiting response','Interviewing','Offer','Rejected','Passed','Dead','Duplicate','Unresolved'];
function updateConflict(r,u){return !!u&&!(r.status===u.status&&(r.applied||'')===u.applied)&&!(r.status===u.baseStatus&&(r.applied||'')===u.baseApplied)}
function refreshLocalRoles(){
  state={...canonicalState,roles:canonicalState.roles.map(r=>{
    const u=personal[r.id]?.statusUpdate;
    if(!u||updateConflict(r,u))return {...r};
    const changed=r.status!==u.status||(r.applied||'')!==u.applied;
    return {...r,status:u.status,applied:u.applied,...(changed?{nextAction:['Passed','Dead','Rejected','Duplicate'].includes(u.status)?'':'Status updated in this browser. Share updates to reconcile the tracker.',nextDue:''}:{})};
  })};
}
function trackerUpdates(){
  return {format:'job-hunt-user-updates-v1',canonicalVersion:canonicalState.meta?.version,exportedAt:new Date().toISOString(),instructions:'Reconcile these user-reported updates by r-id in the private tracker. Check both Gmail accounts for application confirmations. Missing email never disproves a user-reported submission. Planned resume choices are not proof of the resume submitted.',updates:canonicalState.roles.filter(r=>personal[r.id]).map(r=>({id:r.id,company:r.company,position:r.position,link:r.link,canonicalStatus:r.status,canonicalApplied:r.applied||'',...personal[r.id],conflict:updateConflict(r,personal[r.id].statusUpdate)}))};
}
function downloadJson(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportUpdates(){downloadJson(trackerUpdates(),'job-hunt-updates.json')}
async function copyUpdates(){
  try{await navigator.clipboard.writeText('Please reconcile my dashboard updates and check application confirmations in both Gmail accounts:'+String.fromCharCode(10)+JSON.stringify(trackerUpdates(),null,2));document.querySelectorAll('[data-handoff-status]').forEach(el=>el.textContent='Copied. Paste this into ChatGPT or Claude.')}catch{document.querySelectorAll('[data-handoff-status]').forEach(el=>el.textContent='Copy unavailable. Use Export updates and attach the file here.')}
}
function handoffActions(){return '<div class="handoff-actions"><button type="button" data-copy-updates>Copy updates</button><button type="button" data-export-updates>Export updates</button><span data-handoff-status role="status" aria-live="polite"></span></div>'}
function bindHandoff(root=document){root.querySelectorAll('[data-copy-updates]').forEach(el=>el.onclick=copyUpdates);root.querySelectorAll('[data-export-updates]').forEach(el=>el.onclick=exportUpdates)}
function handoffBanner(){const n=Object.keys(personal).length;return n?'<div class="panel handoff-panel"><strong>'+n+' roles with saved browser edits</strong><p>Share your updates here or with Claude to update the shared tracker and check email confirmations. Changes stay in this browser until reconciled.</p>'+handoffActions()+'</div>':''}
let view='dashboard',query='',appSort={key:'score',dir:-1},studioSort={key:'signal',dir:-1},materialSort={key:'applied',dir:-1};
let promotedSources=new Set(readStoredSources());
function readStoredSources(){try{const v=JSON.parse(localStorage.getItem('jobHuntPromotedSources')||'[]');return Array.isArray(v)?v:[]}catch{return []}}
let personal={},personalKey,unreadPersonal=new Set();
const PERSONAL_PREFIX='jobHuntPersonal:v1:';
async function loadPersonal(password){
  personal={};unreadPersonal=new Set();
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  personalKey=await crypto.subtle.deriveKey({name:'PBKDF2',salt:enc.encode('Job Hunt personal v1:'+location.origin+location.pathname),iterations:250000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  for(const r of state.roles){
    try{
      const raw=localStorage.getItem(PERSONAL_PREFIX+r.id);if(!raw)continue;
      const v=JSON.parse(raw);if(v.v!==1)throw Error('version');
      const data=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(v.iv),additionalData:enc.encode(r.id)},personalKey,b64(v.ciphertext))));
      if(typeof data.notes!=='string'||typeof data.intendedResumeRef!=='string')throw Error('data');
      if(data.statusUpdate&&(!ROLE_STATUSES.includes(data.statusUpdate.status)||typeof data.statusUpdate.applied!=='string'||!ROLE_STATUSES.includes(data.statusUpdate.baseStatus)||typeof data.statusUpdate.baseApplied!=='string'))throw Error('status');
      personal[r.id]=data;
    }catch{unreadPersonal.add(r.id)}
  }
}
async function savePersonal(id,data){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},personalKey,enc.encode(JSON.stringify(data))));
  const base64=bytes=>btoa(String.fromCharCode(...bytes));
  if(unreadPersonal.has(id))throw Error('Unread saved notes must not be overwritten');
  localStorage.setItem(PERSONAL_PREFIX+id,JSON.stringify({v:1,iv:base64(iv),ciphertext:base64(ct)}));
  personal[id]=data;
}
function intendedResumeRef(r){return Object.hasOwn(personal,r.id)?personal[r.id].intendedResumeRef:r.intendedResumeRef||''}
function effectiveResumeRef(r){return r.resumeRef||intendedResumeRef(r)}
function privateMaterialUrl(path){
  if(typeof path!=='string'||!path.startsWith('materials/')||path.split('/').some(x=>!x||x==='.'||x==='..')||/[\\?#]/.test(path))return '';
  return 'https://github.com/ACPOmega/job-hunt-command-center/blob/main/'+path.split('/').map(encodeURIComponent).join('/');
}
function documentLinks(d,label){
  if(!d)return '';
  const paths=[['path',label],['source','Open DOCX'],['text','Open letter text']];
  return '<div class="material-links">'+paths.map(([key,title])=>{const url=privateMaterialUrl(d[key]);return url?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+' ↗</a>':''}).join('')+'</div>';
}
function resumeLinks(r){return documentLinks(docById('resumes',effectiveResumeRef(r)),'Open Resume')}
function letterLinks(r){return documentLinks(docById('coverLetters',r.coverLetterRef),'Open Cover Letter')}
function resumeMappingLabel(r){const label=materialResumeLabel(r);return label?label+(r.resumeRef?' · Submitted / verified':' · Intended'):'Not mapped'}
function personalEditor(r){
  const selected=intendedResumeRef(r),personalReadError=unreadPersonal.has(r.id);
  return '<div class="field full personal-editor"><label for="intendedResume">Intended resume</label><select id="intendedResume"><option value="">No planned choice</option>'+(state.documents?.resumes||[]).map(d=>'<option value="'+esc(d.id)+'" '+(selected===d.id?'selected':'')+'>'+esc(d.name||d.id)+'</option>').join('')+'</select><p class="muted">Planned choice only. Submitted mappings stay verified in the private tracker.</p><label for="personalNotes">My notes</label><textarea id="personalNotes" rows="5" maxlength="20000" placeholder="Add your notes for this role…">'+esc(personal[r.id]?.notes||'')+'</textarea><p class="muted">Encrypted in this browser. Use Export data for a backup. These notes do not sync to the private tracker or another device.</p>'+(personalReadError?'<p class="local-warning">Some saved notes could not be read. Use the original access key/browser before saving over them.</p>':'')+'<button type="button" id="savePersonal">Save my updates</button><button type="button" id="exportPersonal">Export data & saved notes</button><span id="personalSaveStatus" role="status" aria-live="polite"></span></div>';
}
function statusEditor(r){
  const base=canonicalState.roles.find(x=>x.id===r.id),u=personal[r.id]?.statusUpdate;
  const labels={Passed:'Passed — I no longer want to apply',Dead:'Posting closed / gone',Applied:'Applied — I submitted it'};
  return '<div class="field full personal-editor"><label for="roleStatus">Update my status</label><select id="roleStatus"><option value="">Use shared tracker status ('+esc(base.status)+')</option>'+ROLE_STATUSES.map(s=>'<option value="'+esc(s)+'" '+(u?.status===s?'selected':'')+'>'+esc(labels[s]||s)+'</option>').join('')+'</select><label for="applicationDate">Application date (if known)</label><input type="date" id="applicationDate" value="'+esc(u?.applied??base.applied??'')+'"><p class="muted">Applied means you submitted it, including a referral. Passed means your decision; Posting closed means the employer stopped accepting applications.</p>'+(updateConflict(base,u)?'<p class="local-warning">The shared tracker changed since your edit. Its status is shown; review your choice before saving again.</p>':'')+'<p class="muted">Save below to update this browser immediately. Then Copy updates and paste here, or attach Export updates, for email checks and shared tracker reconciliation.</p>'+handoffActions()+'</div>';
}
function bindPersonalEditor(r){
  $('#exportPersonal').onclick=exportData;
  bindHandoff($('#detailBody'));
  $('#savePersonal').onclick=async()=>{
    const button=$('#savePersonal'),status=$('#personalSaveStatus');button.disabled=true;
    try{
      const intendedResumeRef=$('#intendedResume').value;
      if(intendedResumeRef&&!docById('resumes',intendedResumeRef))throw Error('mapping');
      const base=canonicalState.roles.find(x=>x.id===r.id),applied=$('#applicationDate').value;
      const statusChoice=$('#roleStatus').value||(applied!==(base.applied||'')?base.status:'');
      if(statusChoice&&!ROLE_STATUSES.includes(statusChoice))throw Error('status');
      const statusUpdate=statusChoice?{status:statusChoice,applied,baseStatus:base.status,baseApplied:base.applied||'',recordedAt:new Date().toISOString()}:null;
      await savePersonal(r.id,{notes:$('#personalNotes').value,intendedResumeRef,updatedAt:new Date().toISOString(),...(statusUpdate?{statusUpdate}:{})});
      refreshLocalRoles();render();$('#resumeMapping').textContent=resumeMappingLabel(r);$('#resumeLinks').innerHTML=resumeLinks(r);
      $('#detailStatus').textContent=state.roles.find(x=>x.id===r.id).status;$('#detailApplied').textContent=state.roles.find(x=>x.id===r.id).applied||'—';
      $('#detailNextAction').textContent=state.roles.find(x=>x.id===r.id).nextAction||'—';
      const breakdown=$('#detailBody .score-breakdown');if(breakdown)breakdown.hidden=state.roles.find(x=>x.id===r.id).status!=='Not applied';
      status.textContent='Saved in this browser.';
    }catch{status.textContent='Could not save. Keep this dialog open and copy your notes or try again.'}
    finally{button.disabled=false}
  };
}
function exportData(){
  downloadJson({...canonicalState,browserLocal:{roles:personal,scope:'This browser only; intended choices and statuses need reconciliation'}},'job-hunt-data.json');
}
const $=s=>document.querySelector(s), enc=new TextEncoder(), dec=new TextDecoder();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
function slug(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function badge(t,c=''){return `<span class="badge ${c}">${esc(t)}</span>`}
function statusBadge(s){return badge(s,'s-'+slug(s))}
function fitBadge(s){return s?badge(s,'b-'+slug(s)):''}
function age(d){if(!d)return '—';const a=new Date(d+'T12:00:00'),b=new Date();b.setHours(12,0,0,0);return Math.max(0,Math.floor((b-a)/86400000))+'d'}
function moneyValues(s){return (String(s||'').match(/\$\s?[\d,.]+/g)||[]).map(x=>Number(x.replace(/[$,\s]/g,''))).filter(Number.isFinite)}
function scoreDetails(r){
  const TARGET_COMP=Number(state.meta?.targetComp||185000),CONTRACT_PARITY=Number(state.meta?.contractParityHourly||88.94);
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

  const track=String(r.track||'');
  // Title seniority deliberately does not affect the score; only the track does.
  const career=track==='Target'?15:track==='Bridge'?8:track==='Pass'||track==='Closed'?0:11;

  let access=4,accessNote='Cold application';
  if(String(r.referral||'').trim()){access=15;accessNote='Referral / internal advocate'}
  else if(String(r.recruiter||'').trim()){access=12;accessNote='Known recruiter / human path'}
  else if(/inbound|referral/i.test(String(r.via||''))){access=11;accessNote='Warm or inbound path'}

  const geoMap={'Remote':10,'Remote US':10,'Seattle area':10,'Washington':10,'California':10,'Domestic':7,'TBD':5,'Unknown':5,'Elsewhere':2,'Canada':1,'Europe':1};
  const geo=geoMap[r.geo]??(/remote/i.test(String(r.location||''))?10:/seattle|redmond|bellevue|renton/i.test(String(r.location||''))?10:/\bCA\b|california|los angeles|san diego|san mateo|irvine|culver city|santa monica/i.test(String(r.location||''))?10:5);

  let fresh=5,freshNote='Age unknown';
  const blob=[r.evidence,r.notes].join(' ');
  const iso=blob.match(/(?:first[_ ]published|published|posted(?:Date)?)[^\d]*(20\d{2}-\d{2}-\d{2})/i);
  if(iso){
    const now=new Date();now.setHours(12,0,0,0);const ageDays=Math.max(0,Math.floor((now-new Date(iso[1]+'T12:00:00'))/86400000));
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
function cmpText(a,b){return String(a??'').localeCompare(String(b??''),undefined,{numeric:true,sensitivity:'base'})}
function fitRank(v){return ({Strong:7,Good:6,Moderate:5,Possible:4,Fair:3,Stretch:2,Weak:1}[v]||0)}
function statusRank(v){return ({Interviewing:9,Offer:8,'Awaiting response':7,Applied:6,'Not applied':5,Unresolved:4,Rejected:3,Passed:2,Dead:1,Duplicate:0}[v]||0)}
function salaryMax(r){const v=moneyValues(r.salary);return v.length?Math.max(...v):0}
function docById(kind,id){return (state.documents?.[kind]||[]).find(d=>d.id===id)}
function materialResumeLabel(r){const d=docById('resumes',effectiveResumeRef(r));return d?.name||d?.title||r.resume||r.resumeVariant||''}
function materialLetterDocLabel(r){const d=docById('coverLetters',r.coverLetterRef);return d?.name||d?.title||''}
function materialLetterLabel(r){return materialLetterDocLabel(r)||r.letter||''}
function materialBadge(v,empty='Not mapped'){return v?badge(v):badge(empty,'muted')}
function appSortValue(r,key){
  if(key==='score')return score(r);
  if(key==='company')return r.company||'';
  if(key==='position')return r.position||'';
  if(key==='status')return statusRank(r.status);
  if(key==='fit')return fitRank(r.fit);
  if(key==='applied')return r.applied||'';
  if(key==='age')return r.applied?Math.floor((Date.now()-new Date(r.applied+'T12:00:00'))/86400000):-1;
  if(key==='location')return r.location||'';
  if(key==='salary')return salaryMax(r);
  if(key==='next')return r.nextDue||r.nextAction||'';
  if(key==='resume')return materialResumeLabel(r);
  if(key==='letter')return materialLetterLabel(r);
  return '';
}
function sortApps(rows){
  const {key,dir}=appSort;return rows.sort((a,b)=>{const av=appSortValue(a,key),bv=appSortValue(b,key);return (typeof av==='number'&&typeof bv==='number'?(av-bv):cmpText(av,bv))*dir});
}
function studioSignalRank(s){
  const st=String(s.status||'').toLowerCase(),sig=String(s.signal||'').toLowerCase();
  let n=0;
  if(st.includes('match found'))n+=100;
  if(/new|found|live|open|applied|unsubmitted|logged|role|producer|director|manager/.test(sig))n+=40;
  if(st.includes('needs manual sweep')||st.includes('needs board resolve'))n+=25;
  if(st.includes('dead'))n-=100;
  if(s.priority==='High')n+=15; else if(s.priority==='Medium')n+=8;
  return n;
}
function studioSortValue(s,key){
  if(key==='signal')return studioSignalRank(s);
  if(key==='last')return s.last||'';
  if(key==='company')return s.co||'';
  if(key==='priority')return ({High:3,Medium:2,Low:1,None:0}[s.priority]||0);
  if(key==='status')return s.status||'';
  return '';
}
function sortStudios(rows){
  const {key,dir}=studioSort;return rows.sort((a,b)=>{const av=studioSortValue(a,key),bv=studioSortValue(b,key);return (typeof av==='number'&&typeof bv==='number'?(av-bv):cmpText(av,bv))*dir});
}
function sourceIsHot(s){return studioSignalRank(s)>=40&&!/dead/i.test(String(s.status||''))}
function savePromotedSources(){localStorage.setItem('jobHuntPromotedSources',JSON.stringify([...promotedSources]))}
function toggleSource(name){promotedSources.has(name)?promotedSources.delete(name):promotedSources.add(name);savePromotedSources();render()}
function promotedSourceCards(){
  const rows=state.studios.filter(s=>promotedSources.has(s.co)).sort((a,b)=>studioSignalRank(b)-studioSignalRank(a));
  return rows.map(s=>`<article class="priority-card source-lead"><div><div class="eyebrow">SOURCE LEAD</div><h3>${esc(s.co)}</h3><p>${esc(s.signal||'Review current openings')}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${badge(s.status||'Source')}${s.last?badge('Checked '+s.last):''}</div><div class="source-actions">${s.board?`<a href="${esc(s.board)}" target="_blank" rel="noopener">Open career board ↗</a>`:''}<button type="button" data-source-toggle="${esc(s.co)}">Remove</button></div></div><div class="process-mark">SOURCE</div></article>`).join('');
}
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
    canonicalState=state;
    await loadPersonal(pw);
    refreshLocalRoles();
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
  $('#exportBtn').onclick=exportData;
}
function metric(l,v,n,hot=false){return `<div class="metric${hot?' hot':''}"><div class="lab">${l}</div><div class="val">${v}</div><div class="note">${n}</div></div>`}
function isActionable(r){return r.status==='Not applied'&&!['Pass','Closed'].includes(String(r.track||''))&&!['Dead','Passed','Duplicate'].includes(String(r.status||''))}
function priorityRoles(){return state.roles.filter(isActionable).sort((a,b)=>score(b)-score(a))}
function activeProcesses(){return state.roles.filter(r=>r.status==='Interviewing').sort((a,b)=>(a.nextDue||'9999').localeCompare(b.nextDue||'9999'))}
function card(r){const d=scoreDetails(r);return `<article class="priority-card" data-role="${esc(r.id)}"><div><h3>${esc(r.company)} · ${esc(r.position)}</h3><p>${esc(r.team||r.location||'')}${r.salary?' · '+esc(r.salary):''}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${fitBadge(r.fit)}${badge(r.track||'Target')}${r.geo?badge(r.geo):''}</div></div><div class="score" title="Opportunity Priority Score"><span>Priority Score</span><b>${d.total}</b></div></article>`}
function processCard(r){return `<article class="priority-card process-card" data-role="${esc(r.id)}"><div><h3>${esc(r.company)} · ${esc(r.position)}</h3><p>${esc(r.nextAction||r.team||'Active interview process')}</p><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">${statusBadge(r.status)}${r.nextDue?badge('Due '+r.nextDue):''}${r.recruiter?badge('Human contact'):''}</div></div><div class="process-mark">ACTIVE</div></article>`}
function dashboard(){const c={};state.roles.forEach(r=>c[r.status]=(c[r.status]||0)+1);const pri=priorityRoles(),active=activeProcesses();return `<div class="metric-grid">${metric('Roles tracked',state.roles.length,'canonical records')}${metric('Need applying',pri.length,'actionable & unsent',true)}${metric('Active processes',active.length,'interviewing now',active.length>0)}${metric('Out for response',(c.Applied||0)+(c['Awaiting response']||0),'submitted')}${metric('Rejected',c.Rejected||0,'closed out')}${metric('Studios',state.studios.length,'boards in sweep')}</div>${active.length?`<div class="panel active-panel"><div class="panel-head"><div><div class="eyebrow">ACTIVE PROCESSES</div><h2>Protect the things already moving</h2></div></div><div class="priority-list">${active.map(processCard).join('')}</div></div>`:''}<div class="panel"><div class="panel-head"><div><div class="eyebrow">DO NEXT</div><h2>Highest-value applications</h2></div></div><div class="priority-list">${pri.slice(0,8).map(card).join('')||'<div class="empty">No unsent priority roles.</div>'}</div></div>`}
function priority(){
  const rows=priorityRoles().filter(r=>!query||searchable(r).includes(query)),active=activeProcesses().filter(r=>!query||searchable(r).includes(query));
  const first=rows.slice(0,5);
  const firstIds=new Set(first.map(r=>r.id));
  const high=rows.filter(r=>!firstIds.has(r.id)&&(r.priority==='High'||score(r)>=70)).slice(0,10);
  const highIds=new Set(high.map(r=>r.id));
  const rest=rows.filter(r=>!firstIds.has(r.id)&&!highIds.has(r.id));
  const empty='<div class="empty">No roles in this lane.</div>';
  const sourceCards=promotedSourceCards(); return `${sourceCards?`<div class="panel source-board-panel"><div class="panel-head"><div><div class="eyebrow">JOB BOARD SOURCES</div><h2>Studios promoted from Source Sweep</h2></div></div><div class="priority-list">${sourceCards}</div></div>`:''}${active.length?`<div class="panel active-panel priority-active"><div class="panel-head"><div><div class="eyebrow">ACTIVE PROCESSES</div><h2>Interviewing now — protect these first</h2></div></div><div class="priority-list">${active.map(processCard).join('')}</div></div>`:''}<div class="kanban"><div class="lane critical"><h2>Apply first</h2>${first.map(card).join('')||empty}</div><div class="lane high"><h2>High value</h2>${high.map(card).join('')||empty}</div><div class="lane bridge"><h2>Secondary / bridge</h2>${rest.map(card).join('')||empty}</div></div>`;
}
function sortArrow(k){return appSort.key===k?(appSort.dir===1?' ▲':' ▼'):''}
function applications(){
  let rows=state.roles.filter(r=>!query||searchable(r).includes(query));sortApps(rows);
  const th=(k,l)=>`<th class="sortable" data-app-sort="${k}">${l}${sortArrow(k)}</th>`;
  return `<div class="tablewrap"><table><thead><tr>${th('score','Score')}${th('company','Company')}${th('position','Role')}${th('status','Status')}${th('fit','Fit')}${th('resume','Resume')}${th('letter','Cover Letter')}${th('applied','Applied')}${th('age','Age')}${th('location','Location')}${th('salary','Salary')}${th('next','Next')}</tr></thead><tbody>${rows.map(r=>`<tr data-id="${esc(r.id)}"><td><b class="table-score">${score(r)}</b></td><td class="company">${esc(r.company)}</td><td>${esc(r.position)}</td><td>${statusBadge(r.status)}</td><td>${fitBadge(r.fit)}</td><td>${esc(materialResumeLabel(r)||'—')}</td><td>${esc(materialLetterLabel(r)||'—')}</td><td>${esc(r.applied||'—')}</td><td>${age(r.applied)}</td><td>${esc(r.location||'—')}</td><td>${esc(r.salary||'—')}</td><td>${esc(r.nextAction||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}
function materialSortValue(r,key){
  if(key==='company')return r.company||'';
  if(key==='position')return r.position||'';
  if(key==='status')return statusRank(r.status);
  if(key==='resume')return materialResumeLabel(r);
  if(key==='letter')return materialLetterLabel(r);
  if(key==='applied')return r.applied||'';
  return '';
}
function materialArrow(k){return materialSort.key===k?(materialSort.dir===1?' ▲':' ▼'):''}
function materials(){
  const resumes=state.documents?.resumes||[], letters=state.documents?.coverLetters||[];
  let rows=[...state.roles];
  if(query)rows=rows.filter(r=>searchable(r).includes(query)||materialResumeLabel(r).toLowerCase().includes(query)||materialLetterLabel(r).toLowerCase().includes(query));
  rows.sort((a,b)=>{const av=materialSortValue(a,materialSort.key),bv=materialSortValue(b,materialSort.key);return (typeof av==='number'&&typeof bv==='number'?(av-bv):cmpText(av,bv))*materialSort.dir});
  const mapped=state.roles.filter(r=>r.resumeRef).length;
  const letterMapped=state.roles.filter(r=>r.coverLetterRef).length;
  const sent=state.roles.filter(r=>/sent|submitted|ready|written/i.test(String(r.letter||''))).length;
  const missing=state.roles.filter(r=>(r.applied||r.status==='Interviewing')&&!r.resumeRef).length;
  const th=(k,l)=>`<th class="sortable" data-material-sort="${k}">${l}${materialArrow(k)}</th>`;
  const resumeCards=resumes.length?resumes.map(d=>`<article class="material-card"><div class="eyebrow">RESUME</div><h3>${esc(d.name||d.title||d.id)}</h3><p>${esc(d.version||d.updatedAt||'')}</p><p>${esc(d.notes||'')}</p>${documentLinks(d,'Open Resume')}</article>`).join(''):'<div class="empty">No resume files mapped yet. Claude can upload the variants and add them to the private manifest.</div>';
  const letterCards=letters.length?letters.map(d=>`<article class="material-card"><div class="eyebrow">COVER LETTER</div><h3>${esc(d.name||d.title||d.id)}</h3><p>${esc(d.version||d.updatedAt||'')}</p><p>${esc(d.notes||'')}</p>${documentLinks(d,'Open Cover Letter')}</article>`).join(''):'<div class="empty">No cover-letter files mapped yet. Existing Sent / Ready / Not written statuses are still tracked per role.</div>';
  return `<div class="metric-grid">${metric('Resume variants',resumes.length,'uploaded & normalized')}${metric('Roles with resume',mapped,'exact variant mapped')}${metric('Letter files',letters.length,'uploaded & normalized')}${metric('Letters tracked',sent,'sent / ready / written')}${metric('Missing resume map',missing,'applied/interviewing roles',missing>0)}</div><div class="panel"><div class="panel-head"><div><div class="eyebrow">DOCUMENT LIBRARY</div><h2>Resume variants</h2></div></div><div class="material-grid">${resumeCards}</div></div><div class="panel"><div class="panel-head"><div><div class="eyebrow">DOCUMENT LIBRARY</div><h2>Cover letters</h2></div></div><div class="material-grid">${letterCards}</div></div><div class="panel"><div class="panel-head"><div><div class="eyebrow">ROLE MAPPING</div><h2>Submitted materials & planned choices</h2><p class="muted">Files open in the private library and require your GitHub sign-in. Select a role to edit its planned resume and notes.</p></div></div><div class="tablewrap"><table><thead><tr>${th('company','Company')}${th('position','Role')}${th('status','Status')}${th('resume','Resume')}${th('letter','Cover Letter')}${th('applied','Applied')}</tr></thead><tbody>${rows.map(r=>`<tr data-id="${esc(r.id)}"><td class="company">${esc(r.company)}</td><td>${esc(r.position)}</td><td>${statusBadge(r.status)}</td><td>${esc(resumeMappingLabel(r))}${resumeLinks(r)}</td><td>${esc(materialLetterLabel(r)||'—')}${letterLinks(r)}</td><td>${esc(r.applied||'—')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function studioArrow(k){return studioSort.key===k?(studioSort.dir===1?' ▲':' ▼'):''}
function studioCard(s,hot=false){
  const promoted=promotedSources.has(s.co);
  return `<article class="studio${hot?' studio-hot':''}"><div class="panel-head"><div><h3>${esc(s.co)}</h3>${hot?'<div class="eyebrow">NEW / ACTIONABLE</div>':''}</div>${badge(s.cadence||'')}</div><div class="studio-meta">${badge(s.priority||'')}${badge(s.status||'')}</div><p class="signal">${esc(s.signal||'No current signal recorded.')}</p><p>${esc(s.notes||'')}</p><div class="studio-actions">${s.board?`<a href="${esc(s.board)}" target="_blank" rel="noopener">Open career board ↗</a>`:''}<button type="button" class="${promoted?'promoted':''}" data-source-toggle="${esc(s.co)}">${promoted?'On Job Board ✓':'Promote to Job Board'}</button></div><p>Last checked: ${esc(s.last||'—')} · ${esc(s.ats||'')}</p></article>`;
}
function studios(){
  let rows=state.studios.filter(s=>!query||[s.co,s.ats,s.status,s.signal,s.notes].join(' ').toLowerCase().includes(query));
  const hot=rows.filter(sourceIsHot).sort((a,b)=>studioSignalRank(b)-studioSignalRank(a)||(b.last||'').localeCompare(a.last||'')).slice(0,12);
  sortStudios(rows);
  return `<div class="source-toolbar"><div><strong>All sources</strong><span>Fresh matches and changed boards are pinned above.</span></div><label>Sort <select id="studioSort"><option value="signal" ${studioSort.key==='signal'?'selected':''}>New jobs / signal</option><option value="last" ${studioSort.key==='last'?'selected':''}>Last checked</option><option value="priority" ${studioSort.key==='priority'?'selected':''}>Priority</option><option value="company" ${studioSort.key==='company'?'selected':''}>Company</option><option value="status" ${studioSort.key==='status'?'selected':''}>Status</option></select></label><button id="studioSortDir" type="button">${studioSort.dir===-1?'Newest / highest first':'Oldest / lowest first'}</button></div>${hot.length?`<div class="panel hot-sources"><div class="panel-head"><div><div class="eyebrow">NEW JOBS & ACTION NEEDED</div><h2>Sources worth looking at now</h2></div><span class="muted">${hot.length} pinned</span></div><div class="studio-grid">${hot.map(s=>studioCard(s,true)).join('')}</div></div>`:''}<div class="panel-head all-source-head"><div><div class="eyebrow">ALL SOURCES</div><h2>${rows.length} studios / career boards</h2></div></div><div class="studio-grid">${rows.map(s=>studioCard(s,false)).join('')}</div>`;
}
function activity(){const rows=[...(state.activity||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));return `<div class="panel"><div class="timeline">${rows.map(e=>`<div class="event"><div class="date">${esc(e.date)}</div><div class="actor">${esc(e.actor)}</div><div><strong>${esc(e.type||'Update')}</strong> ${esc(e.summary)}</div></div>`).join('')}</div></div>`}
function openRole(id){const r=state.roles.find(x=>x.id===id);if(!r)return;const d=scoreDetails(r),showScore=r.status==='Not applied';$('#detailEyebrow').textContent=r.company;$('#detailTitle').textContent=r.position;$('#detailBody').innerHTML=`<div class="detail-grid"><div class="field"><label>Status</label><span id="detailStatus">${esc(r.status)}</span></div><div class="field"><label>Fit</label>${esc(r.fit||'—')}</div><div class="field"><label>Team</label>${esc(r.team||'—')}</div><div class="field"><label>Location</label>${esc(r.location||'—')}</div><div class="field"><label>Salary</label>${esc(r.salary||'—')}</div><div class="field"><label>Applied</label><span id="detailApplied">${esc(r.applied||'—')}</span></div>${showScore?`<div class="field full score-breakdown"><label>Opportunity Priority Score · ${d.total}/100</label><div class="score-grid"><span>Role Fit <b>${d.fit}/30</b></span><span>Compensation <b>${d.comp}/20</b></span><span>Career Value <b>${d.career}/15</b></span><span>Access & Signal <b>${d.access}/15</b></span><span>Geography <b>${d.geo}/10</b></span><span>Freshness & Liveness <b>${d.fresh}/10</b></span></div><p>${esc(d.compNote)} · ${esc(d.accessNote)} · ${esc(d.freshNote)}${d.mods.length?' · '+esc(d.mods.join(', ')):''}</p></div>`:''}<div class="field full materials-detail"><label>Application materials</label><div class="material-detail-row"><span>Resume</span><b id="resumeMapping">${esc(resumeMappingLabel(r))}</b></div><div id="resumeLinks">${resumeLinks(r)}</div><div class="material-detail-row"><span>Cover letter</span><b>${esc(materialLetterLabel(r)||'—')}</b></div>${letterLinks(r)}<p class="muted">Private library — GitHub sign-in required.</p></div>${statusEditor(r)}${personalEditor(r)}<div class="field full"><label>Next action</label><span id="detailNextAction">${esc(r.nextAction||'—')}</span></div>${r.referral?`<div class="field full"><label>Referral</label>${esc(r.referral)}</div>`:''}${r.recruiter?`<div class="field full"><label>Recruiter / contact</label>${esc(r.recruiter)}</div>`:''}<div class="field full"><label>Evidence</label>${esc(r.evidence||'—')}</div><div class="field full"><label>Tracker notes</label>${esc(r.notes||'—')}</div>${r.link?`<div class="field full"><label>Posting</label><a href="${esc(r.link)}" target="_blank" rel="noopener">Open posting ↗</a></div>`:''}</div>`;bindPersonalEditor(r);$('#detailDialog').showModal()}
const titles={dashboard:['Dashboard','What matters now, across the entire search.'],priority:['Priority Queue','Verified opportunities you have not applied to.'],applications:['Applications','Evidence-backed application state across both inboxes.'],materials:['Materials','Exact resumes and cover letters tied to each role.'],studios:['Studio Sweep','The actual career boards — not just LinkedIn.'],activity:['Activity','What changed, who changed it, and why.']};
function render(){
  const t=titles[view];$('#viewTitle').textContent=t[0];$('#viewSub').textContent=t[1];$('#priorityBadge').textContent=priorityRoles().length;$('#syncMini').innerHTML=`<b>${esc(state.meta?.version||'1.0')}</b><br>${state.roles.length} roles · ${state.studios.length} studios`;$('#view').innerHTML=handoffBanner()+(view==='dashboard'?dashboard():view==='priority'?priority():view==='applications'?applications():view==='materials'?materials():view==='studios'?studios():activity());bindHandoff();
  document.querySelectorAll('[data-id],[data-role]').forEach(el=>el.onclick=e=>{if(e.target.closest('a,button,select,textarea'))return;openRole(el.dataset.id||el.dataset.role)});
  document.querySelectorAll('[data-app-sort]').forEach(el=>el.onclick=()=>{const k=el.dataset.appSort;if(appSort.key===k)appSort.dir*=-1;else{appSort={key:k,dir:(k==='company'||k==='position'||k==='status'||k==='fit'||k==='location'?1:-1)}}render()});
  document.querySelectorAll('[data-material-sort]').forEach(el=>el.onclick=()=>{const k=el.dataset.materialSort;if(materialSort.key===k)materialSort.dir*=-1;else materialSort={key:k,dir:(k==='company'||k==='position'||k==='status'||k==='resume'||k==='letter'?1:-1)};render()});
  document.querySelectorAll('[data-source-toggle]').forEach(el=>el.onclick=e=>{e.stopPropagation();toggleSource(el.dataset.sourceToggle)});
  const ss=$('#studioSort');if(ss)ss.onchange=e=>{studioSort.key=e.target.value;studioSort.dir=(studioSort.key==='company'||studioSort.key==='status'?1:-1);render()};
  const sd=$('#studioSortDir');if(sd)sd.onclick=()=>{studioSort.dir*=-1;render()};
}
const magicKey=decodeURIComponent(location.hash.slice(1))||sessionStorage.getItem('jobHuntMagicKey')||'';
if(magicKey){unlock(magicKey)}else{$('#accessMessage').textContent='This dashboard opens from your private access link.';$('#unlockError').textContent='Private key missing from this URL.';}
})();
