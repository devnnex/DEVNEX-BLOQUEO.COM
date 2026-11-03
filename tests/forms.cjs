const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const store=require('../js/private-store.js'),paymentModel=require('../js/payment-model.js');
const root=path.resolve(__dirname,'..');
async function audit(page,label){
  const errors=await page.evaluate(()=>{
    const issues=[],width=innerWidth,visible=el=>{const box=el.getBoundingClientRect(),style=getComputedStyle(el);return box.width>0&&box.height>0&&style.visibility!=='hidden'&&style.opacity!=='0';};
    if(document.documentElement.scrollWidth>width+1){issues.push('Page scroll width '+document.documentElement.scrollWidth+' > '+width);issues.push(...[...document.querySelectorAll('body *')].filter(el=>visible(el)&&el.getBoundingClientRect().right>width+1).slice(0,6).map(el=>el.tagName+'.'+String(el.className)+' right='+el.getBoundingClientRect().right));}
    for(const el of document.querySelectorAll('input,select,textarea')){
      if(!visible(el))continue;const box=el.getBoundingClientRect();
      if(box.left<-.5||box.right>width+1)issues.push((el.id||el.name||el.type)+' outside viewport: '+box.left+'..'+box.right);
      const label=el.closest('label');if(label){const parent=label.getBoundingClientRect();if(box.left<parent.left-1||box.right>parent.right+1)issues.push((el.id||el.name)+' exceeds label');}
      if(!['checkbox','range'].includes(el.type)&&parseFloat(getComputedStyle(el).fontSize)<16)issues.push((el.id||el.name)+' font too small for touch inputs');
    }
    const dialog=document.querySelector('dialog[open]');if(dialog&&dialog.scrollWidth>dialog.clientWidth+1)issues.push('Dialog has horizontal overflow: '+dialog.scrollWidth+' > '+dialog.clientWidth);
    for(const container of document.querySelectorAll('.table-wrap,.table-toolbar,.payment-card,.setting-row'))if(visible(container)&&container.scrollWidth>container.clientWidth+1)issues.push(String(container.className)+' has internal horizontal overflow');
    return issues;
  });
  assert.deepEqual(errors,[],label+': '+errors.join('; '));
}
(async()=>{
  const key=crypto.randomBytes(32).toString('base64url'),configuration=JSON.parse(fs.readFileSync(path.join(root,'push-config.json'),'utf8'));
  configuration.ownerKeyHash=crypto.createHash('sha256').update(key).digest('base64url');
  const projectName='UN-PROYECTO-CON-NOMBRE-EXTENSO-PARA-REVISAR-LA-INTERFAZ-DEL-ADMINISTRADOR.COM';
  const payment=paymentModel.normalize({id:'forms-test',client:'Cliente con un nombre extenso que debe poder leerse sin romper ninguna tarjeta',project_id:projectName,amount:999999999,due_at:'2027-12-31T23:59:00Z',frequency:'monthly',note:'Un concepto detallado del pago que debe ajustarse al ancho disponible en cualquier dispositivo.'});
  const records=[{project_id:projectName,status:'active',amount:999999999,message:'Recordatorio cordial que debe ajustarse al espacio de la tarjeta sin provocar desplazamiento horizontal.'},await store.seal(paymentModel.PREFIX+payment.id,payment,key)];
  const backend=require('./backend-fixture.cjs').fixture({ownerKey:key});records.forEach(backend.add);const login=backend.login();
  const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const [engine,type]of[['chromium',chromium],['webkit',webkit]]){
      const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
      const browser=await type.launch(engine==='chromium'&&chrome?{executablePath:chrome,headless:true}:{headless:true});
      try{
        const context=await browser.newContext({viewport:{width:390,height:844},locale:'es-CO',timezoneId:'America/Bogota',serviceWorkers:'block',hasTouch:true});
        await context.route('https://script.google.com/**',route=>{const request=route.request(),url=new URL(request.url());return route.fulfill({json:backend.request(request.method(),request.method()==='POST'?request.postDataJSON():Object.fromEntries(url.searchParams))});});
        await context.route('**/push-config.json',route=>route.fulfill({json:configuration}));
        await context.route(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//,route=>route.fulfill({body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/javascript'}));
        const page=await context.newPage(),runtimeErrors=[];page.on('pageerror',error=>runtimeErrors.push(error.message));
        await page.goto(base);await page.locator('#loginForm').waitFor({state:'visible'});
        for(const [width,height]of[[280,653],[320,568],[390,844],[768,1024],[1366,768],[568,320]]){await page.setViewportSize({width,height});await audit(page,engine+' login '+width);}
        await page.evaluate(login=>{localStorage.setItem('devnex.session.v1',JSON.stringify({token:login.session_token,expiresAt:login.expires_at}));return DevnexAuth.guard();},login);
        await page.waitForFunction(()=>DevnexApp.state.projects.length===1);
        for(const [width,height]of[[280,653],[320,568],[360,640],[390,844],[430,932],[768,1024],[921,768],[1024,768],[1180,820],[1366,768],[568,320]]){
          await page.setViewportSize({width,height});
          await page.evaluate(()=>DevnexApp.setView('dashboard'));await audit(page,engine+' dashboard '+width);
          await page.evaluate(()=>DevnexApp.setView('projects'));await page.locator('#projectsTableBody [data-action=edit]').waitFor();await audit(page,engine+' projects '+width);
          await page.locator('#newProjectButton').click();await page.locator('#projectStatusInput').selectOption('warning');
          await page.locator('#projectIdInput').fill('https://github.com/devnnex/'+projectName);await page.locator('#warningHoursInput').fill('8760');await page.locator('#projectMessageInput').fill('Aviso importante para acordar el pago del contrato. '.repeat(18));
          await audit(page,engine+' project dialog '+width);await page.locator('#closeDialog').click();
          await page.evaluate(()=>DevnexApp.setView('payments'));await page.locator('.payment-card').waitFor();await audit(page,engine+' payments '+width);
          await page.locator('#newPayment').click();await page.locator('#paymentForm [name=client]').fill('Cliente con nombre extenso');
          await page.locator('#paymentForm [name=amount]').fill('999999999');await page.locator('#paymentForm [name=due_local]').fill('2027-12-31T23:59');await page.locator('#paymentForm [name=frequency]').selectOption('custom');await page.locator('#paymentForm [name=remind_before_hours]').selectOption('168');
          await audit(page,engine+' date/time and selects '+width);
          if(width===320||width===390)await page.screenshot({path:path.join(root,'test-results',`payment-form-${engine}-${width}.png`),fullPage:true,animations:'disabled'});
          await page.locator('#paymentDialog [data-close-payment]').first().click();
          await page.evaluate(()=>DevnexApp.setView('settings'));await audit(page,engine+' settings '+width);
          await page.locator('#brandName').fill('Marca con un nombre largo para revisar su ajuste');await audit(page,engine+' settings inputs '+width);
          await page.evaluate(()=>document.getElementById('notificationDialog').showModal());await audit(page,engine+' notification dialog '+width);await page.locator('#laterPush').click();
        }
        assert.deepEqual(runtimeErrors,[],engine+' runtime errors');await context.close();
        console.log(engine+': all forms, date/time, selects and views fit 280–1366px, including landscape.');
      }finally{await browser.close();}
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
