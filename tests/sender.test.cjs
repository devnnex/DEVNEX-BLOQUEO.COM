const test=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),crypto=require('node:crypto');
const webpush=require('web-push'),privateStore=require('../js/private-store.js');
const state=require('../js/project-guard.js'),{run}=require('../scripts/send-notifications.cjs');
test('background sender stores encrypted receipts, deduplicates, then handles a new deadline',async()=>{
  const ownerKey=crypto.randomBytes(32).toString('base64url'),vapid=webpush.generateVAPIDKeys();
  const configuration={vapidPublicKey:vapid.publicKey,subject:'mailto:test@example.com',ownerKeyHash:crypto.createHash('sha256').update(ownerKey).digest('base64url')};
  const now=Date.now();
  const client=()=>state.serialize({project_id:'CLIENT',status:'warning',amount:300000,deadline_at:new Date(now-1000).toISOString(),message:'Pago pendiente'});
  let records=[client(),await privateStore.seal('__DEVNEX_PUSH__device',{id:'device',subscription:{endpoint:'https://fcm.googleapis.com/test',keys:{p256dh:'a',auth:'b'}}},ownerKey)];
  const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    res.setHeader('Content-Type','application/json');
    if(req.method==='GET'){res.end(JSON.stringify({success:true,projects:records}));return;}
    const value=JSON.parse(body),{action,...record}=value;
    if(action==='delete')records=records.filter(p=>p.project_id!==record.project_id);
    else records=[record,...records.filter(p=>p.project_id!==record.project_id)];
    res.end(JSON.stringify({success:true}));
  });});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    let sent=0;
    const options={ownerKey,vapidPrivateKey:vapid.privateKey,configuration,now,apiUrl:`http://127.0.0.1:${server.address().port}`,send:async(_,payload)=>{sent++;assert.match(JSON.parse(payload).body,/300\.000/);}};
    const first=await run(options);assert.equal(first.sent,1);assert.equal(sent,1);
    assert.ok(records.some(p=>p.project_id==='__DEVNEX_DELIVERY__device'));
    assert.equal((await run(options)).sent,0);assert.equal(sent,1);
    records=records.map(p=>p.project_id==='CLIENT'?{project_id:'CLIENT',status:'active',amount:0,message:''}:p);
    await run(options); // active state clears prior-event receipts
    records=records.map(p=>p.project_id==='CLIENT'?client():p);
    assert.equal((await run(options)).sent,1);assert.equal(sent,2);
    records=records.filter(p=>!p.project_id.startsWith('__DEVNEX_DELIVERY__'));
    const expired=await run({...options,send:async()=>{const error=new Error('gone');error.statusCode=410;throw error;}});
    assert.equal(expired.expired,1);assert.ok(!records.some(p=>p.project_id.startsWith('__DEVNEX_PUSH__')));
  }finally{await new Promise(resolve=>server.close(resolve));}
});
