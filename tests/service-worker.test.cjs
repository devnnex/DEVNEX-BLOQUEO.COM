const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function environment(){
  const listeners={},shown=[],opened=[];
  const scope='https://example.com/DEVNEX/';
  const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,...options})},
    clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,callback)=>listeners[name]=callback};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../sw.js'),'utf8'),{self,URL});
  return{listeners,shown,opened};
}
test('push handler shows a branded COP message with app-scoped navigation',async()=>{
  const env=environment();let pending;
  env.listeners.push({data:{json:()=>({title:'DEVNEX · Pago por cobrar',body:'Cliente · $ 250.000 COP.',url:'./index.html#payments',tag:'payment-1'})},waitUntil:value=>pending=value});
  await pending;
  assert.equal(env.shown[0].title,'DEVNEX · Pago por cobrar');
  assert.match(env.shown[0].body,/COP/);
  assert.equal(env.shown[0].icon,'https://example.com/DEVNEX/assets/icons/favicon-192.png');
  assert.equal(env.shown[0].data.url,'https://example.com/DEVNEX/index.html#payments');
  let closed=false;
  env.listeners.notificationclick({notification:{close:()=>closed=true,data:{url:'https://malicious.example/'}},waitUntil:value=>pending=value});
  await pending;assert.equal(closed,true);assert.equal(env.opened[0],'https://example.com/DEVNEX/index.html#payments');
});
test('malformed push still displays a fallback and cannot navigate outside this PWA',async()=>{
  const env=environment();let pending;
  env.listeners.push({data:{json:()=>{throw new Error('bad');}},waitUntil:value=>pending=value});
  await pending;assert.equal(env.shown.length,1);assert.match(env.shown[0].title,/DEVNEX/);
  env.listeners.push({data:{json:()=>({url:'../other-app/'})},waitUntil:value=>pending=value});
  await pending;assert.equal(env.shown[1].data.url,'https://example.com/DEVNEX/index.html#payments');
});
