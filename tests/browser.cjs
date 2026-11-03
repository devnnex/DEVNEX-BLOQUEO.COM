const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const model = require('../js/project-guard.js');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
let records = [{ project_id: 'CLIENT-TEST', status: 'active', amount: 125000, message: 'Recordatorio de prueba' }];
const clientRecord = () => records.find(p=>p.project_id==='CLIENT-TEST');
const setClient = record => { records=records.map(p=>p.project_id==='CLIENT-TEST'?record:p); };
let rejectWrites = false;
let delayWrites=0;
const backend=require('./backend-fixture.cjs').fixture();
const apiResponse = (method, payload, id, action) => {
  if(rejectWrites&&['create','update','delete'].includes(payload.action))return {success:false,message:'Prueba: escritura rechazada'};
  backend.state.rows=[['project_id','status','amount','message'],...records.map(r=>[r.project_id,r.status,r.amount,r.message])];
  const data=backend.request(method,method==='GET'?{project_id:id,action}:payload);
  records=backend.state.rows.slice(1).map(r=>({project_id:r[0],status:r[1],amount:r[2],message:r[3]}));return data;
};
const clientHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Cliente de prueba</title></head><body style="margin:0;background:#edf1f5;font:16px system-ui;color:#181a20"><main id="clientApp" style="padding:24px"><header style="padding:32px;background:white;border-radius:16px"><p style="color:blue;font-weight:bold">CENTRO DE MANDO</p><h1>TIENDA NAPOLES</h1><p>Cervezas, Licores, cócteles y mucho más</p><button id="customerButton" style="padding:16px;background:blue;color:white;border:0;border-radius:10px">Ver cliente</button></header><p>El sistema sigue disponible mientras acuerdas tu pago.</p><label>Buscar producto <input id="customerInput" style="font-size:16px;padding:12px;max-width:90%"></label></main><script>window.DEVNEX_BLOCKER_CONFIG={project_id:'CLIENT-TEST',apiUrl:'/test-api'};</script><script src="/js/project-guard.js"></script></body></html>`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/test-api') {
    res.setHeader('Content-Type', 'application/json');
    let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => res.end(JSON.stringify(apiResponse(req.method, body ? JSON.parse(body) : {}, url.searchParams.get('project_id')))));
    return;
  }
  if (['/client.html','/customer/index.html','/mesa.html','/admin.html'].includes(url.pathname)) { res.setHeader('Content-Type', 'text/html'); res.end(clientHtml); return; }
  if (url.pathname === '/connected/admin.html') {
    const id=url.searchParams.get('connection');
    if(!/^[\w-]{36}$/.test(id)){res.writeHead(400);res.end();return;}
    res.setHeader('Content-Type','text/html');
    res.end(clientHtml.replace("project_id:'CLIENT-TEST'","project_id:'OLD-WRONG-ID'").replace('<script src="/js/project-guard.js">',`<script src="/js/project-guard.js" data-devnex-connector="v1" data-project-id="CLIENT-TEST" data-devnex-repository="devnnex/CLIENT-TEST" data-devnex-connection="${id}" data-devnex-health="__DEVNEX_HEALTH__${id}">`));return;
  }
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache'); fs.createReadStream(file).pipe(res);
});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visible(page, selector) { await page.locator(selector).waitFor({ state: 'visible' }); }
async function noOverflow(page, label) {
  const result = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth+1).slice(0,5).map(el => el.tagName+'.'+el.className) }));
  assert.ok(result.scroll <= result.width + 1, `${label}: ${JSON.stringify(result)}`);
}
async function screenshot(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' }); }
async function mockRemote(context) {
  await context.route('https://script.google.com/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if(delayWrites&&['create','update','delete'].includes(req.postDataJSON()?.action))await wait(delayWrites);
    await route.fulfill({ json: apiResponse(req.method(), req.postDataJSON() || {}, url.searchParams.get('project_id'),url.searchParams.get('action')) });
  });
  // Runtime libraries are optional; avoid third-party network dependence in functional tests.
  await context.route(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//, route => route.fulfill({ body: '', contentType: route.request().resourceType() === 'stylesheet' ? 'text/css' : 'text/javascript' }));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { headless: true });
  const errors = [];
  try {
    await require('./loading.cjs')(browser,url);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',timezoneId:'America/Bogota' });
    await mockRemote(context);
    const ownerKey=backend.ownerKey;
    const publicConfig=JSON.parse(fs.readFileSync(path.join(root,'push-config.json'),'utf8'));
    publicConfig.ownerKeyHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerKey))).toString('base64url');
    await context.route('**/push-config.json',route=>route.fulfill({json:publicConfig}));
    const setupSettings={ownerKey:backend.ownerKey,salt:backend.salt,secret:backend.secret};
    const setupHtml=fs.readFileSync(path.join(root,'scripts/auth-setup.html'),'utf8').replace('__PRIVATE_CONFIG__',JSON.stringify(setupSettings));
    await context.route('**/auth-setup-qa.html',route=>route.fulfill({body:setupHtml,contentType:'text/html'}));
    const setupPage=await context.newPage();await setupPage.goto(url+'/auth-setup-qa.html');
    await setupPage.locator('[name=password]').fill(backend.password);await setupPage.locator('[name=confirm]').fill(backend.password);
    await setupPage.locator('#setup button').click();await setupPage.locator('#result').waitFor({state:'visible'});
    const setupCode=await setupPage.locator('#code').inputValue();assert.ok(!setupCode.includes(backend.password));
    let configured;require('node:vm').runInNewContext(setupCode+';configurarAccesoDevnex();',{PropertiesService:{getScriptProperties:()=>({setProperties:p=>configured=p})},CacheService:{getScriptCache:()=>({remove(){}})}});
    assert.equal(configured.DEVNEX_AUTH_VERIFIER,backend.properties.DEVNEX_AUTH_VERIFIER);assert.equal(configured.DEVNEX_OWNER_KEY,ownerKey);await setupPage.close();
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(()=>{localStorage.setItem('devnex.auth','old-unverified-user');localStorage.setItem('devnex.ownerKey','old-unverified-key');});
    await page.reload();assert.equal(await page.locator('#appShell').isVisible(),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('devnex.ownerKey')),null);
    for (const [width, height] of [[320,568],[375,667],[390,844],[768,1024],[1366,768],[1920,1080],[812,375]]) {
      await page.setViewportSize({ width, height });
      await noOverflow(page, `login ${width}x${height}`);
      assert.equal(await page.locator('[name=user]').evaluate(el => getComputedStyle(el).fontSize), '16px');
      await page.locator('[name=password]').fill('test-password');
      await page.locator('#loginForm button').scrollIntoViewIfNeeded();
      if (width === 1366 || width === 390) await screenshot(page, `login-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[name=user]').fill('other@gmail.com');
    await page.locator('#loginForm button').click();await visible(page,'.toast.error');
    assert.equal(await page.locator('#appShell').isVisible(),false);
    await page.locator('[name=user]').fill('elkin56ty@gmail.com');
    await page.locator('[name=password]').fill('incorrect-password');
    await page.locator('#loginForm button').click();
    await page.waitForFunction(()=>!document.querySelector('#loginForm button').disabled);
    assert.equal(await page.locator('#appShell').isVisible(),false);
    await page.locator('[name=password]').fill(backend.password);
    await page.locator('#loginForm button').click();
    await visible(page, '#appShell');
    await page.waitForFunction(() => DevnexApp.state.projects.length === 1);
    for (const [width, height] of [[320,568],[390,844],[768,1024],[1366,768],[1920,1080]]) {
      await page.setViewportSize({ width, height }); await noOverflow(page, `dashboard ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.side-nav [data-view-link=settings]').click();
    assert.equal(await page.locator('#pairDeviceForm').count(),0,'login must authorize notifications without a pairing form');
    await page.waitForFunction(()=>!!localStorage.getItem('devnex.ownerKey'));
    await page.locator('.side-nav [data-view-link=projects]').click();
    await visible(page, '[data-action=toggle]');
    await page.locator('[data-action=toggle]').click();
    await visible(page, '#warningFields');
    await page.locator('#warningHoursInput').fill('2');
    await page.locator('#warningPositionInput').selectOption('top-left');
    await page.locator('#warningTopInput').fill('96');
    await page.locator('#projectMessageInput').fill('Hola, acordemos el pago cordialmente. <script>no ejecutar</script>');
    await page.locator('#projectForm button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#projectDialog').open);
    assert.equal(clientRecord().status, 'active');
    let scheduled = model.normalize(clientRecord());
    assert.equal(scheduled.status, 'warning'); assert.equal(scheduled.warning_position, 'top-left');
    const deadline = scheduled.deadline_at;
    assert.equal(await page.locator('.connection-led.pending').count(),1);
    const connectionRecords=records.filter(p=>p.project_id.startsWith('__DEVNEX_CONNECTION__'));
    assert.equal(connectionRecords.length,1);
    const queuedConnection=await require('../js/private-store.js').open(connectionRecords[0],ownerKey);
    const connected=await context.newPage();await connected.goto(url+'/connected/admin.html?connection='+queuedConnection.request_id);
    await connected.waitForFunction(()=>!!localStorage.getItem('devnex.health.last:'+document.querySelector('[data-devnex-connector]').dataset.devnexConnection));
    await page.evaluate(()=>DevnexConnections.refresh());
    await visible(page,'.connection-led.online');await connected.close();
    await page.locator('[data-action=edit]').focus();
    await page.evaluate(()=>DevnexConnections.refresh({fresh:true}));
    assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'edit','LED refresh must preserve keyboard focus');
    await screenshot(page, 'projects-mobile');
    await page.reload();
    await visible(page, '[data-action=edit]');
    assert.equal(await page.evaluate(() => DevnexApp.state.projects[0].deadline_at), deadline);
    await page.locator('[data-action=edit]').click();
    await page.locator('#projectIdInput').fill('https://github.com/devnnex/CLIENT-TEST');
    await page.locator('#projectMessageInput').fill('Un mensaje actualizado, conservando el plazo.');
    await page.locator('#projectForm button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#projectDialog').open);
    assert.equal(model.normalize(clientRecord()).deadline_at, deadline);
    assert.equal(records.filter(p=>p.project_id.startsWith('__DEVNEX_CONNECTION__')).length,1);
    // A rejected save must retain the form and existing persisted deadline.
    rejectWrites = true;
    await page.locator('[data-action=edit]').click();
    await page.locator('#projectMessageInput').fill('No se debe guardar');
    await page.locator('#projectForm button[type=submit]').click();
    await visible(page, '.toast.error');
    assert.equal(await page.locator('#projectDialog').evaluate(el => el.open), true);
    assert.equal(model.normalize(clientRecord()).deadline_at, deadline);
    rejectWrites = false;
    await page.locator('#cancelDialog').click();
    // Updates render before a slow response, and a rejected deletion restores the row.
    delayWrites=900;
    await page.locator('[data-action=edit]').click();
    await page.locator('#projectAmountInput').fill('2000000');
    await page.locator('#projectForm button[type=submit]').click();
    assert.equal(await page.locator('#projectsTableBody tr').getAttribute('aria-busy'),'true');
    assert.match(await page.locator('#projectsTableBody').textContent(),/2\.000\.000/);
    await page.waitForFunction(()=>!document.querySelector('#projectDialog').open);
    rejectWrites=true;page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-action=delete]').click();
    assert.equal(await page.locator('#projectsTableBody [data-action=edit]').count(),0);
    await page.evaluate(()=>DevnexProjects.reload());
    assert.equal(await page.locator('#projectsTableBody [data-action=edit]').count(),0,'a refresh must not resurrect a pending deletion');
    await visible(page,'#projectsTableBody [data-action=edit]');
    rejectWrites=false;delayWrites=0;
    await page.setViewportSize({width:1366,height:768}); await screenshot(page, 'projects-desktop');

    // Link an owner device and create an encrypted recurring payment through the UI.
    await page.setViewportSize({width:390,height:844});
    await page.locator('.side-nav [data-view-link=payments]').click();
    await page.locator('#newPayment').click();
    await visible(page,'#paymentDialog');
    await page.locator('#paymentForm [name=client]').fill('Cliente mensual QA');
    await page.locator('#paymentForm [name=amount]').fill('250000');
    await page.locator('#paymentForm [name=due_local]').fill('2027-01-31T09:00');
    await page.locator('#paymentForm [name=frequency]').selectOption('monthly');
    await page.locator('#paymentForm [name=note]').fill('Mensualidad del contrato');
    await page.locator('#paymentForm [type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('#paymentDialog').open);
    const paymentRecord=records.find(p=>p.project_id.startsWith('__DEVNEX_PAYMENT__'));
    assert.ok(paymentRecord); assert.equal(paymentRecord.amount,0);
    assert.ok(!paymentRecord.message.includes('Cliente mensual QA'));
    await page.reload();await visible(page,'.payment-card');
    // Payment creation and deletion are immediate while failures retain the editable form.
    delayWrites=900;rejectWrites=true;
    await page.locator('#newPayment').click();
    await page.locator('#paymentForm [name=client]').fill('Pago que debe revertirse');
    await page.locator('#paymentForm [name=amount]').fill('3500000');
    await page.locator('#paymentForm [type=submit]').click();
    assert.equal(await page.locator('.payment-card[aria-busy=true]').count(),1);
    await page.waitForFunction(()=>!document.querySelector('#paymentForm [type=submit]').disabled);
    assert.equal(await page.locator('.payment-card').count(),1);
    assert.equal(await page.locator('#paymentDialog').evaluate(el=>el.open),true);
    await page.locator('#paymentDialog [data-close-payment]').first().click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-payment-action=delete]').click();
    assert.equal(await page.locator('.payment-card').count(),0);
    await page.locator('#refreshPayments').click();
    assert.equal(await page.locator('.payment-card').count(),0,'a refresh must not resurrect a pending payment deletion');
    await visible(page,'.payment-card');
    rejectWrites=false;delayWrites=0;
    await screenshot(page,'payments-mobile');
    for(const [width,height] of [[320,568],[390,844],[768,1024],[1366,768]]) {
      await page.setViewportSize({width,height});await noOverflow(page,`payments ${width}`);
    }
    await screenshot(page,'payments-desktop');
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-payment-action=paid]').click();
    await page.waitForFunction(()=>document.querySelector('.payment-card').textContent.includes('Último pago recibido'));
    const received=await require('../js/private-store.js').open(records.find(p=>p.project_id===paymentRecord.project_id),ownerKey);
    assert.equal(received.due_at,'2027-02-28T14:00:00.000Z');
    await page.locator('.side-nav [data-view-link=projects]').click();
    await visible(page,'[data-action=edit]');
    assert.equal(await page.locator('#projectsTableBody tr').count(),1,'internal payment records must not appear as projects');

    // Only the admin page sees the warning; the deadline survives reload.
    const client = await context.newPage(); client.on('pageerror', e => errors.push(e.message));
    await client.goto(url + '/admin.html'); await visible(client, '#devnexProjectGuard .warning');
    assert.equal(await client.locator('#clientApp').evaluate(el => el.inert), false);
    await client.locator('#customerInput').fill('Se puede trabajar');
    await client.reload(); await visible(client, '#devnexProjectGuard .warning');
    assert.equal(model.normalize(clientRecord()).deadline_at, deadline);
    await client.setViewportSize({width:1366,height:768}); await screenshot(client, 'client-warning-desktop');
    for (const [width,height] of [[320,568],[390,844],[812,375]]) {
      await client.setViewportSize({width,height}); await noOverflow(client, `warning ${width}`);
      const box = await client.locator('#devnexProjectGuard .warning').boundingBox();
      assert.ok(box.x >= 0 && box.x+box.width <= width+1 && box.y >= 0 && box.y+box.height <= height+1);
    }
    await client.setViewportSize({width:390,height:844}); await screenshot(client, 'client-warning-mobile');
    const secondContext = await browser.newContext(); const second = await secondContext.newPage();
    await second.goto(url + '/admin.html'); await visible(second, '#devnexProjectGuard .warning');
    await secondContext.close();

    // Local expiration requires no additional network response.
    scheduled = {...model.normalize(clientRecord()),deadline_at:new Date(Date.now()+2500).toISOString()};
    setClient(model.serialize(scheduled));
    await client.reload(); await visible(client, '#devnexProjectGuard .warning');
    await visible(client, '#devnexProjectGuard .overlay');
    assert.equal(await client.locator('#clientApp').evaluate(el => el.inert), true);
    assert.equal(await client.locator('#devnexProjectGuard .owner').textContent(),'ELKIN RANGEL');
    assert.equal(await client.locator('#devnexProjectGuard .number').textContent(),'320 875 9798');
    for(const route of ['/client.html','/customer/index.html','/mesa.html']){
      const publicPage=await context.newPage(),requests=[];
      publicPage.on('request',request=>{if(request.url().includes('/test-api'))requests.push(request.url());});
      await publicPage.goto(url+route);await publicPage.locator('#customerInput').fill('La página pública sigue funcionando');
      assert.equal(await publicPage.locator('#devnexProjectGuard').count(),0);
      assert.equal(await publicPage.evaluate(()=>!!window.__devnexGuard),false);
      assert.equal(await publicPage.locator('#clientApp').evaluate(el=>el.inert),false);
      assert.equal(requests.length,0,'public pages must not even query collection data');
      await publicPage.close();
    }
    for (const [width,height] of [[320,568],[390,844],[1366,768],[812,375]]) {
      await client.setViewportSize({width,height}); await noOverflow(client, `blocker ${width}`);
      await client.locator('#devnexProjectGuard .cta').scrollIntoViewIfNeeded();
      if (width===390 || width===1366) await screenshot(client, `client-blocked-${width}`);
    }
    // Cached expiration survives reload even if only the remote API is unreachable.
    await client.route('**/test-api*', route => route.abort());
    await client.reload(); await visible(client, '#devnexProjectGuard .overlay');
    await client.unroute('**/test-api*');
    // Unlock is received while the page stays open; background interaction is restored.
    setClient(model.serialize({...scheduled,status:'active',deadline_at:null}));
    await client.bringToFront();
    const deliveredAt=Date.now();
    await page.evaluate(()=>{const channel=new BroadcastChannel('devnex.control.v2');channel.postMessage({type:'project-changed',project_id:'CLIENT-TEST'});channel.close();});
    await client.locator('#devnexProjectGuard').waitFor({state:'detached',timeout:8000});
    console.log('Admin unlock propagated without the old 15-second wait: '+(Date.now()-deliveredAt)+'ms in local browser test.');
    assert.equal(await client.locator('#clientApp').evaluate(el => el.inert), false);
    await client.locator('#customerInput').fill('Acceso restablecido');
    // Old immediate blocks also work and clearing an active warning removes it.
    setClient({project_id:'CLIENT-TEST',status:'blocked',amount:125000,message:'Pago pendiente'});
    await client.evaluate(() => window.dispatchEvent(new Event('online')));
    await visible(client, '#devnexProjectGuard .overlay');
    setClient(model.serialize({...scheduled,deadline_at:new Date(Date.now()+3600000).toISOString()}));
    await client.evaluate(() => window.dispatchEvent(new Event('online')));
    await visible(client, '#devnexProjectGuard .warning');
    assert.equal(await client.locator('#clientApp').evaluate(el => el.inert), false);
    setClient(model.serialize({...scheduled,status:'active',deadline_at:null}));
    await client.evaluate(() => window.dispatchEvent(new Event('online')));
    await client.locator('#devnexProjectGuard').waitFor({state:'detached'});
    // PWA shell: every precached URL exists, installation activates, shell reloads offline.
    const pwaContext = await browser.newContext();
    await mockRemote(pwaContext);
    await pwaContext.route('**/push-config.json',route=>route.fulfill({json:publicConfig}));
    const pwa = await pwaContext.newPage(); pwa.on('pageerror', e => errors.push(e.message));
    await pwa.goto(url);
    await pwa.evaluate(() => navigator.serviceWorker.ready);
    await pwa.waitForFunction(() => !!navigator.serviceWorker.controller);
    const manifest = await (await pwa.request.get(url+'/manifest.json')).json();
    assert.equal(manifest.display,'standalone');
    for (const icon of manifest.icons) {
      const response = await pwa.request.get(url+'/'+icon.src);
      assert.equal(response.status(),200);
      const buffer = await response.body(); const size = Number(icon.sizes.split('x')[0]);
      assert.equal(buffer.readUInt32BE(16),size); assert.equal(buffer.readUInt32BE(20),size);
    }
    assert.ok((await pwa.evaluate(async () => (await caches.open('devnex-pwa-v11')).keys().then(v=>v.length))) >= 25);
    // Permission and encrypted device registration without sending to a real push endpoint.
    await pwaContext.grantPermissions(['notifications']);
    const pwaSession=apiResponse('POST',{action:'login',email:'elkin56ty@gmail.com',proof:backend.proof});
    await pwa.evaluate(({session,publicKey})=>{
      localStorage.setItem('devnex.session.v1',JSON.stringify({token:session.session_token,expiresAt:session.expires_at}));
      window.__shownNotifications=[];
      const subscription={endpoint:'https://fcm.googleapis.com/test-browser',options:{applicationServerKey:DevnexPrivateStore.bytes(publicKey)},toJSON:()=>({endpoint:'https://fcm.googleapis.com/test-browser',keys:{p256dh:'test-key',auth:'test-auth'}}),unsubscribe:async()=>true};
      PushManager.prototype.getSubscription=async()=>null;
      PushManager.prototype.subscribe=async()=>subscription;
      ServiceWorkerRegistration.prototype.showNotification=async(title,options)=>window.__shownNotifications.push({title,...options});
      DevnexAuth.guard();
    },{session:pwaSession,publicKey:publicConfig.vapidPublicKey});
    await pwa.waitForFunction(()=>DevnexAuth.isLoggedIn());
    await pwa.locator('.side-nav [data-view-link=settings]').click();
    await pwa.locator('#enablePush').click();
    await pwa.waitForFunction(()=>!!localStorage.getItem('devnex.pushId'));
    assert.ok(records.some(p=>p.project_id.startsWith('__DEVNEX_PUSH__')));
    assert.ok(!records.find(p=>p.project_id.startsWith('__DEVNEX_PUSH__')).message.includes('fcm.googleapis.com'));
    assert.equal(await pwa.evaluate(()=>window.__shownNotifications[0].title),'DEVNEX · Ya estamos conectados');
    await pwa.locator('.side-nav [data-view-link=settings]').click();
    await pwa.locator('[data-view=settings] .logout-button').click();
    assert.equal(await pwa.evaluate(()=>localStorage.getItem('devnex.ownerKey')),null);
    await pwaContext.setOffline(true); await pwa.reload();
    await visible(pwa, '#loginForm'); await noOverflow(pwa, 'offline PWA');
    await pwaContext.close(); await context.close();
  } finally {
    await browser.close(); server.close();
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed. Screenshots: test-results/.');
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
