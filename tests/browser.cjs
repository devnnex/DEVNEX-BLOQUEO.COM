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
const apiResponse = (method, payload, id) => {
  if (method === 'POST') {
    if (rejectWrites) return { success: false, message: 'Prueba: escritura rechazada' };
    const wire = Object.fromEntries(['project_id', 'status', 'amount', 'message'].map(k => [k, payload[k]]));
    if (payload.action === 'delete') records = records.filter(p => p.project_id !== payload.project_id);
    else records = [wire, ...records.filter(p => p.project_id !== wire.project_id)];
    return { success: true };
  }
  return id ? { success: true, project: records.find(p => p.project_id === id) } : { success: true, projects: records };
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
  if (url.pathname === '/client.html') { res.setHeader('Content-Type', 'text/html'); res.end(clientHtml); return; }
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
    await route.fulfill({ json: apiResponse(req.method(), req.postDataJSON() || {}, url.searchParams.get('project_id')) });
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
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block',timezoneId:'America/Bogota' });
    await mockRemote(context);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    for (const [width, height] of [[320,568],[375,667],[390,844],[768,1024],[1366,768],[1920,1080],[812,375]]) {
      await page.setViewportSize({ width, height });
      await noOverflow(page, `login ${width}x${height}`);
      assert.equal(await page.locator('[name=user]').evaluate(el => getComputedStyle(el).fontSize), '16px');
      await page.locator('[name=password]').fill('test-password');
      await page.locator('#loginForm button').scrollIntoViewIfNeeded();
      if (width === 1366 || width === 390) await screenshot(page, `login-${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[name=user]').fill('QA');
    await page.locator('#loginForm button').click();
    await visible(page, '#appShell');
    await page.waitForFunction(() => DevnexApp.state.projects.length === 1);
    for (const [width, height] of [[320,568],[390,844],[768,1024],[1366,768],[1920,1080]]) {
      await page.setViewportSize({ width, height }); await noOverflow(page, `dashboard ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
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
    await screenshot(page, 'projects-mobile');
    await page.reload();
    await visible(page, '[data-action=edit]');
    assert.equal(await page.evaluate(() => DevnexApp.state.projects[0].deadline_at), deadline);
    await page.locator('[data-action=edit]').click();
    await page.locator('#projectMessageInput').fill('Un mensaje actualizado, conservando el plazo.');
    await page.locator('#projectForm button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('#projectDialog').open);
    assert.equal(model.normalize(clientRecord()).deadline_at, deadline);
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
    await page.setViewportSize({width:1366,height:768}); await screenshot(page, 'projects-desktop');

    // Link an owner device and create an encrypted recurring payment through the UI.
    const ownerKey=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const publicConfig=JSON.parse(fs.readFileSync(path.join(root,'push-config.json'),'utf8'));
    publicConfig.ownerKeyHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerKey))).toString('base64url');
    await context.route('**/push-config.json',route=>route.fulfill({json:publicConfig}));
    await page.locator('.side-nav [data-view-link=settings]').click();
    await page.locator('#pairingKey').fill(ownerKey);
    await page.locator('#pairDeviceForm button').click();
    await page.waitForFunction(()=>!!localStorage.getItem('devnex.ownerKey'));
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

    // Client sees one nonblocking warning in every section, and its deadline survives reload.
    const client = await context.newPage(); client.on('pageerror', e => errors.push(e.message));
    await client.goto(url + '/client.html'); await visible(client, '#devnexProjectGuard .warning');
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
    await second.goto(url + '/client.html'); await visible(second, '#devnexProjectGuard .warning');
    await secondContext.close();

    // Local expiration requires no additional network response.
    scheduled = {...model.normalize(clientRecord()),deadline_at:new Date(Date.now()+2500).toISOString()};
    setClient(model.serialize(scheduled));
    await client.reload(); await visible(client, '#devnexProjectGuard .warning');
    await visible(client, '#devnexProjectGuard .overlay');
    assert.equal(await client.locator('#clientApp').evaluate(el => el.inert), true);
    assert.equal(await client.locator('#devnexProjectGuard .owner').textContent(),'ELKIN RANGEL');
    assert.equal(await client.locator('#devnexProjectGuard .number').textContent(),'320 875 9798');
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
    await client.evaluate(() => window.dispatchEvent(new Event('online')));
    await client.locator('#devnexProjectGuard').waitFor({state:'detached'});
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
    assert.ok((await pwa.evaluate(async () => (await caches.open('devnex-pwa-v3')).keys().then(v=>v.length))) >= 25);
    // Permission and encrypted device registration without sending to a real push endpoint.
    await pwaContext.grantPermissions(['notifications']);
    await pwa.evaluate(({ownerKey,publicKey})=>{
      localStorage.setItem('devnex.auth','QA');localStorage.setItem('devnex.ownerKey',ownerKey);
      window.__shownNotifications=[];
      const subscription={endpoint:'https://fcm.googleapis.com/test-browser',options:{applicationServerKey:DevnexPrivateStore.bytes(publicKey)},toJSON:()=>({endpoint:'https://fcm.googleapis.com/test-browser',keys:{p256dh:'test-key',auth:'test-auth'}}),unsubscribe:async()=>true};
      PushManager.prototype.getSubscription=async()=>null;
      PushManager.prototype.subscribe=async()=>subscription;
      ServiceWorkerRegistration.prototype.showNotification=async(title,options)=>window.__shownNotifications.push({title,...options});
      DevnexAuth.guard();
    },{ownerKey,publicKey:publicConfig.vapidPublicKey});
    await pwa.locator('.side-nav [data-view-link=settings]').click();
    await pwa.locator('#enablePush').click();
    await pwa.waitForFunction(()=>!!localStorage.getItem('devnex.pushId'));
    assert.ok(records.some(p=>p.project_id.startsWith('__DEVNEX_PUSH__')));
    assert.ok(!records.find(p=>p.project_id.startsWith('__DEVNEX_PUSH__')).message.includes('fcm.googleapis.com'));
    assert.equal(await pwa.evaluate(()=>window.__shownNotifications[0].title),'DEVNEX · Ya estamos conectados');
    await pwa.evaluate(()=>localStorage.removeItem('devnex.auth'));
    await pwaContext.setOffline(true); await pwa.reload();
    await visible(pwa, '#loginForm'); await noOverflow(pwa, 'offline PWA');
    await pwaContext.close(); await context.close();
  } finally {
    await browser.close(); server.close();
  }
  assert.deepEqual(errors, []);
  console.log('Browser checks passed. Screenshots: test-results/.');
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
