const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./backend-fixture.cjs'),store=require('../js/private-store.js');
const gate=()=>{let release;const promise=new Promise(resolve=>release=resolve);return {promise,release};};
module.exports=async function verifyLoading(browser,base){
  const backend=fixture(),assets=gate(),login=gate(),read=gate(),calls=[];
  backend.add({project_id:'FAST-CLIENT.COM',status:'active',amount:4500000,message:''});
  backend.add(await store.seal('__DEVNEX_PAYMENT__speed-test',{id:'speed-test',client:'Cliente de prueba',amount:4500000,due_at:'2027-12-31T14:00:00Z',frequency:'monthly'},backend.ownerKey));
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  let holdReads=false;
  try{
    await context.route(/https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//,async route=>{await assets.promise;await route.fulfill({body:'',contentType:route.request().resourceType()==='stylesheet'?'text/css':'text/javascript'}).catch(()=>{});});
    await context.route('https://script.google.com/**',async route=>{
      const request=route.request(),url=new URL(request.url()),body=request.method()==='POST'?request.postDataJSON():Object.fromEntries(url.searchParams);
      calls.push(body.action);
      if(body.action==='login')await login.promise;
      if(body.action==='get'&&holdReads)await read.promise;
      await route.fulfill({json:backend.request(request.method(),body)}).catch(()=>{});
    });
    const page=await context.newPage();
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:10000});
    await page.locator('#loginForm').waitFor({state:'visible',timeout:3000});
    assert.equal(await page.locator('#loginForm [type=submit]').isEnabled(),true,'optional CDNs must not delay an interactive login');
    assets.release();
    await page.waitForFunction(()=>!!localStorage.getItem('devnex.auth.challenge.v1'));
    assert.equal(calls.filter(action=>action==='auth_challenge').length,1);
    await page.locator('[name=user]').fill('elkin56ty@gmail.com');await page.locator('[name=password]').fill(backend.password);
    await page.locator('#loginForm [type=submit]').click();await page.locator('#screenLoader').waitFor({state:'visible'});
    assert.equal(calls.filter(action=>action==='auth_challenge').length,1,'submitting a prepared login must not repeat the challenge request');
    for(const [width,height] of [[280,653],[320,568],[390,844],[1366,768],[568,320]]){
      await page.setViewportSize({width,height});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'login loader overflow at '+width);
      assert.ok(await page.locator('#screenLoader .load-card').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight+1;}),'login loader exceeds screen height at '+width+'x'+height);
      if(width===390||width===1366)await page.screenshot({path:path.join(__dirname,'../test-results',`premium-loader-${width}.png`),animations:'disabled'});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#screenLoader .load-ring').first().evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});login.release();
    await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#screenLoader').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.getElementById('paymentSummary').textContent.includes('4.500.000'));
    assert.equal(calls.filter(action=>action==='get').length,0,'login records must prewarm payments without another request');
    await page.evaluate(()=>{const original=Date.now;Date.now=()=>original()+10000;});
    await page.evaluate(()=>DevnexApp.setView('payments'));await page.locator('.payment-card').waitFor();
    await page.evaluate(()=>DevnexApp.setView('projects'));await page.locator('[data-action=edit]').waitFor();
    await page.evaluate(()=>DevnexApp.setView('payments'));await page.locator('.payment-card').waitFor();
    assert.equal(calls.filter(action=>action==='get').length,0,'switching views ten seconds after login must reuse authenticated records');
    holdReads=true;await page.locator('#refreshPayments').click();await page.locator('#paymentsLoading').waitFor({state:'visible'});
    assert.equal(await page.locator('.payment-card').count(),1,'refresh keeps existing payments available');
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(__dirname,'../test-results/premium-loader-payments.png'),animations:'disabled'});
    read.release();await page.locator('#paymentsLoading').waitFor({state:'hidden'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>DevnexApp.setView('settings'));await page.locator('[data-view=settings] .logout-button').click();
    await page.evaluate(()=>{
      const cached=JSON.parse(localStorage.getItem('devnex.auth.challenge.v1'));cached.salt='B'.repeat(43);cached.prepared_at=Date.now()-120000;localStorage.setItem('devnex.auth.challenge.v1',JSON.stringify(cached));
    });
    await page.locator('[name=user]').fill('elkin56ty@gmail.com');await page.locator('[name=password]').fill(backend.password);await page.locator('#loginForm [type=submit]').click();
    await page.locator('#appShell').waitFor({state:'visible'});await page.locator('#screenLoader').waitFor({state:'hidden'});
    assert.equal(calls.filter(action=>action==='auth_challenge').length,2,'a rotated preparation must refresh once');
    assert.equal(calls.filter(action=>action==='login').length,3,'only a changed salt may retry the login automatically');
    assert.ok(await page.evaluate(()=>{const cached=JSON.parse(localStorage.getItem('devnex.auth.challenge.v1'));return !['password','proof','session_token','owner_key'].some(key=>key in cached);}));
    console.log('Loading checks passed: CDN-independent startup, prepared login with rotation recovery, prewarmed payments, instant cached navigation, nonblocking refresh, mobile layout and reduced motion.');
  }finally{assets.release();login.release();read.release();await context.close();}
};
