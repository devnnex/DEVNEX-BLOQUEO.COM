const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../js/payment-model.js');
const privateStore=require('../js/private-store.js');
const {eventsFor,pendingEvents,validSubscription}=require('../scripts/notification-events.cjs');
const key=crypto.getRandomValues(new Uint8Array(32));
const encoded=privateStore.base64(key);
const payment=(overrides={})=>model.normalize({id:'test-id',client:'Cliente QA',amount:250000,due_at:model.fromInput('2027-01-31T09:00'),frequency:'monthly',...overrides});
test('Colombia input dates round trip independently of the host timezone',()=>{
  assert.equal(model.fromInput('2027-01-31T09:00'),'2027-01-31T14:00:00.000Z');
  assert.equal(model.inputDate('2027-01-31T14:00:00.000Z'),'2027-01-31T09:00');
});
test('monthly billing remembers January 31 across February and March',()=>{
  const feb=model.paid(payment());assert.equal(model.inputDate(feb.due_at),'2027-02-28T09:00');
  const march=model.paid(feb);assert.equal(model.inputDate(march.due_at),'2027-03-31T09:00');
  const leap=model.paid(payment({due_at:model.fromInput('2028-01-31T23:15')}));
  assert.equal(model.inputDate(leap.due_at),'2028-02-29T23:15');
});
test('weekly, fortnightly and custom payments advance exactly one period',()=>{
  for(const [frequency,days]of[['weekly',7],['fortnightly',15],['custom',21]]){
    const p=payment({frequency,interval_days:21});
    const next=model.paid(p,'2027-12-31T12:00:00Z');
    assert.equal(Date.parse(next.due_at)-Date.parse(p.due_at),days*86400000);
    assert.equal(next.history.length,1);
  }
  assert.equal(model.paid(payment({frequency:'once'})).active,false);
});
test('payment records encrypt personal data and bind the ciphertext to the record ID',async()=>{
  const p=payment(),record=await privateStore.seal('__DEVNEX_PAYMENT__'+p.id,p,encoded);
  assert.equal(record.amount,0);assert.ok(!record.message.includes('Cliente QA'));
  assert.deepEqual(await privateStore.open(record,encoded),p);
  await assert.rejects(()=>privateStore.open({...record,project_id:'OTHER'},encoded));
  await assert.rejects(()=>privateStore.open(record,privateStore.base64(crypto.getRandomValues(new Uint8Array(32)))));
});
test('payment notices include COP and have distinct advance/due deduplication IDs',()=>{
  const p=payment({remind_before_hours:24}),due=Date.parse(p.due_at);
  assert.equal(eventsFor([], [p],due-25*3600000).length,0);
  const before=eventsFor([], [p],due-3600000)[0],late=eventsFor([], [p],due)[0];
  assert.match(late.body,/250\.000.*COP/);assert.notEqual(before.id,late.id);
  assert.equal(pendingEvents([late],{sent:{[late.id]:'sent'}}).pending.length,0);
  assert.deepEqual(pendingEvents([],{sent:{[late.id]:'sent'}}).sent,{});
  assert.equal(eventsFor([], [model.paid(payment({frequency:'once'}))],due).length,0);
});
test('projects notify only after their persisted deadline and ignore internal records',()=>{
  const now=Date.now(),state=require('../js/project-guard.js');
  const wire=state.serialize({project_id:'CLIENT',status:'warning',amount:123000,message:'Aviso',deadline_at:new Date(now+1000).toISOString()});
  assert.equal(eventsFor([wire],[],now).length,0);
  assert.equal(eventsFor([wire],[],now+1000).length,1);
  assert.equal(eventsFor([{...wire,project_id:'__DEVNEX_TEST__'}],[],now+1000).length,0);
});
test('push destinations must be recognized HTTPS browser push providers',()=>{
  const sub=endpoint=>({endpoint,keys:{p256dh:'a',auth:'b'}});
  assert.equal(validSubscription(sub('https://fcm.googleapis.com/fcm/send/test')),true);
  assert.equal(validSubscription(sub('https://web.push.apple.com/test')),true);
  for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/test','https://example.com/test','https://fcm.googleapis.com.evil.test/test','https://user:password@fcm.googleapis.com/test'])assert.equal(validSubscription(sub(endpoint)),false);
});
