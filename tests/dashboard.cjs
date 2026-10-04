// Run with Node and Playwright available. Uses synthetic encrypted data, never the live key.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {webcrypto:crypto}=require('node:crypto');
const {chromium}=require('playwright');
const site=path.resolve(__dirname,'../site');
const password='Synthetic dashboard test key only';
const fixture={meta:{version:'test'},roles:[{id:'r01',company:'Example',position:'Example Operations Role',status:'Not applied',fit:'Strong',track:'Target',letter:'Ready',resumeRef:'',intendedResumeRef:'res-tpm',coverLetterRef:'cl-r01'},{id:'r02',company:'Verified',position:'Producer',status:'Applied',resumeRef:'res-ps',coverLetterRef:'cl-text'}],studios:[{co:'Source test',status:'Match found',priority:'High',signal:'New role',board:'https://example.com/careers'}],documents:{resumes:[{id:'res-tpm',name:'Technical Program Manager',path:'materials/resumes/TPM test.pdf',source:'materials/resumes/TPM test.docx'},{id:'res-ps',name:'Production Systems',path:'materials/resumes/PS.pdf'}],coverLetters:[{id:'cl-r01',name:'Example letter',path:'materials/cover-letters/Example test.pdf',text:'materials/cover-letters/src/r01.json'},{id:'cl-text',name:'Text only',text:'materials/cover-letters/src/r02.json'}]}};
async function payload(){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial=await crypto.subtle.importKey('raw',Buffer.from(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['encrypt']);
  return {v:1,iterations:250000,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),ciphertext:Buffer.from(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,Buffer.from(JSON.stringify(fixture)))).toString('base64')};
}
(async()=>{
  let encrypted=await payload();
  const server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname;
    if(name==='/data/job-data.enc.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(encrypted))}
    const target=path.join(site,name==='/'?'index.html':name);
    if(!target.startsWith(site+path.sep)){res.statusCode=403;return res.end()}
    try{res.setHeader('Content-Type',target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(target))}catch{res.statusCode=404;res.end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:'+server.address().port;
    await page.goto(url+'/#'+encodeURIComponent(password));await page.locator('#appShell').waitFor({state:'visible'});
    await page.locator('[data-role="r01"]').click();
    assert.match(await page.locator('#resumeMapping').innerText(),/Technical Program Manager.*Intended/);
    const href=await page.locator('#resumeLinks a').first().getAttribute('href');assert.equal(href,'https://github.com/ACPOmega/job-hunt-command-center/blob/main/materials/resumes/TPM%20test.pdf');
    assert.equal(await page.getByRole('link',{name:'Open Cover Letter'}).count(),1);
    const note='Follow up <script>alert(1)</script> & bring portfolio';
    await page.locator('#personalNotes').fill(note);await page.locator('#intendedResume').selectOption('res-ps');await page.locator('#savePersonal').click();await page.getByText('Saved in this browser.',{exact:true}).waitFor();
    const raw=await page.evaluate(()=>localStorage.getItem('jobHuntPersonal:v1:r01'));assert(!raw.includes('Follow up'));assert(!raw.includes('res-ps'));
    await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-role="r01"]').click();assert.equal(await page.locator('#personalNotes').inputValue(),note);assert.equal(await page.locator('#intendedResume').inputValue(),'res-ps');assert.equal(await page.locator('#detailBody script').count(),0);
    await page.locator('#detailDialog .icon-btn').click();await page.locator('[data-view="materials"]').click();assert.equal(await page.locator('.material-card a').count(),6);
    await page.locator('[data-id="r02"] .company').click();await page.locator('#intendedResume').selectOption('res-tpm');await page.locator('#savePersonal').click();await page.getByText('Saved in this browser.',{exact:true}).waitFor();assert.match(await page.locator('#resumeMapping').innerText(),/Production Systems.*Submitted/);assert.equal(await page.locator('#detailDialog').getByRole('link',{name:'Open letter text'}).count(),1);
    await page.locator('#personalNotes').fill('Keep on failed save');await page.evaluate(()=>Storage.prototype.setItem=function(){throw Error('Quota exceeded')});await page.locator('#savePersonal').click();await page.getByText(/Could not save/).waitFor();assert.equal(await page.locator('#personalNotes').inputValue(),'Keep on failed save');
    await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.evaluate(()=>localStorage.setItem('jobHuntPersonal:v1:r01','invalid'));await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-role="r01"]').click();await page.getByText(/Some saved notes could not be read/).waitFor();await page.locator('#savePersonal').click();await page.getByText(/Could not save/).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('jobHuntPersonal:v1:r01')),'invalid');
    await page.locator('#detailDialog .icon-btn').click();await page.locator('[data-view="studios"]').click();await page.getByRole('button',{name:'Promote to Job Board'}).first().click();await page.locator('[data-view="priority"]').click();assert.equal(await page.locator('.source-lead').count(),1);
    await page.locator('[data-view="materials"]').click();await page.locator('[data-material-sort="resume"]').click();
    for(const width of [1280,390]){await page.setViewportSize({width,height:900});await page.locator('[data-id="r01"] .company').click();for(const light of [false,true]){await page.evaluate(light=>document.documentElement.classList.toggle('light',light),light);const sizes=await page.locator('#personalNotes').evaluate(e=>({width:e.getBoundingClientRect().width,dialog:e.closest('dialog').getBoundingClientRect().width}));assert(sizes.width>150&&sizes.width<=sizes.dialog);if(process.env.TEST_SCREENSHOTS){fs.mkdirSync(process.env.TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.TEST_SCREENSHOTS,'role-'+width+'-'+(light?'light':'dark')+'.png')})}}if(width===390){const backup=page.waitForEvent('download');await page.locator('#exportPersonal').click();await backup}await page.locator('#detailDialog .icon-btn').click()}
    await page.setViewportSize({width:1280,height:900});const downloadPromise=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await downloadPromise;const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(data.browserLocal.roles.r02.intendedResumeRef,'res-tpm');assert.equal(data.roles.find(r=>r.id==='r02').resumeRef,'res-ps');
    // Status updates change the local queue immediately but keep canonical data distinct.
    await page.evaluate(()=>localStorage.removeItem('jobHuntPersonal:v1:r01'));
    await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-role="r01"]').click();
    await page.locator('#roleStatus').selectOption('Applied');await page.locator('#applicationDate').fill('2026-10-04');await page.locator('#personalNotes').fill('Submitted using the company form');await page.locator('#savePersonal').click();await page.getByText('Saved in this browser.',{exact:true}).waitFor();
    assert.equal(await page.locator('#priorityBadge').innerText(),'0');assert.equal(await page.locator('#detailStatus').innerText(),'Applied');assert.equal(await page.locator('#detailApplied').innerText(),'2026-10-04');assert.equal(await page.locator('#detailBody .score-breakdown').isVisible(),false);
    const statusRaw=await page.evaluate(()=>localStorage.getItem('jobHuntPersonal:v1:r01'));assert(!statusRaw.includes('Applied'));assert(!statusRaw.includes('Submitted using'));
    await page.reload();await page.locator('#appShell').waitFor({state:'visible'});assert.equal(await page.locator('[data-role="r01"]').count(),0);await page.locator('[data-view="applications"]').click();await page.locator('[data-id="r01"] .company').click();assert.equal(await page.locator('#roleStatus').inputValue(),'Applied');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedUpdates=value}}}));await page.locator('#detailDialog [data-copy-updates]').click();const copied=await page.evaluate(()=>window.copiedUpdates);assert(copied.includes('job-hunt-user-updates-v1'));assert(copied.includes('check application confirmations'));
    const changesPromise=page.waitForEvent('download');await page.locator('#detailDialog [data-export-updates]').click();const changesDownload=await changesPromise;const changes=JSON.parse(fs.readFileSync(await changesDownload.path(),'utf8'));const update=changes.updates.find(r=>r.id==='r01');assert.equal(update.statusUpdate.status,'Applied');assert.equal(update.statusUpdate.baseStatus,'Not applied');assert.equal(update.canonicalStatus,'Not applied');
    // A newer canonical decision wins over an out-of-date local change.
    fixture.roles[0].status='Dead';encrypted=await payload();await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-view="applications"]').click();await page.locator('[data-id="r01"] .company').click();assert.equal(await page.locator('#detailStatus').innerText(),'Dead');await page.getByText(/shared tracker changed since your edit/).waitFor();
    await page.locator('#roleStatus').selectOption('');await page.locator('#applicationDate').fill('');await page.locator('#savePersonal').click();await page.getByText('Saved in this browser.',{exact:true}).waitFor();assert.equal(await page.locator('#personalNotes').inputValue(),'Submitted using the company form');
    fixture.roles[0].status='Not applied';encrypted=await payload();await page.reload();await page.locator('#appShell').waitFor({state:'visible'});await page.locator('[data-role="r01"]').click();
    for(const status of ['Passed','Dead']){await page.locator('#roleStatus').selectOption(status);await page.locator('#savePersonal').click();await page.getByText('Saved in this browser.',{exact:true}).waitFor();assert.equal(await page.locator('#priorityBadge').innerText(),'0');assert.equal(await page.locator('#detailNextAction').innerText(),'—')}
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}}));await page.locator('#detailDialog [data-copy-updates]').click();await page.locator('#detailDialog').getByText(/Copy unavailable/).waitFor();
    assert.deepEqual(errors,[]);console.log('PASS: private material links, encryption/reload, XSS escaping, submitted mappings, storage errors, source/sort workflows, themes/mobile, status/date edits, immediate queue removal, canonical conflict protection, clipboard handoff and exports.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
