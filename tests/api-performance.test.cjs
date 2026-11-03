const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const model=require('../js/project-guard.js');
function setup({verified=false,authenticated=false}={}){
  let rows=[{project_id:'TEST',status:'active',amount:0,message:''}],dropSchedule=false;
  const calls=[],messages=[];
  const app={apiUrl:'https://api.example/exec'},window={DevnexApp:app};
  if(authenticated)window.DevnexAuth={token:()=> 'test-session-token'};
  const fetch=async(url,options)=>{
    calls.push(options.method);await new Promise(resolve=>setTimeout(resolve,5));
    if(options.method==='POST'){
      const {action,session_token,...record}=JSON.parse(options.body);
      if(authenticated)assert.equal(session_token,'test-session-token');
      assert.ok(!url.includes('test-session-token'),'tokens must not appear in URLs');
      if(action!=='get'){
        if(dropSchedule)record.message='schedule was dropped';
        rows=action==='delete'?rows.filter(r=>r.project_id!==record.project_id):[record,...rows.filter(r=>r.project_id!==record.project_id)];
        return {ok:true,text:async()=>JSON.stringify(verified?{success:true,verified:true,project:record,deleted_id:record.project_id}:{success:true})};
      }
    }
    return {ok:true,text:async()=>JSON.stringify({success:true,projects:rows})};
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/api.js'),'utf8'),{window,DevnexProjectState:model,fetch,URLSearchParams,AbortSignal,Date,console,BroadcastChannel:class{postMessage(value){messages.push(value);}}});
  return {api:window.DevnexAPI,calls,messages,drop:()=>dropSchedule=true};
}
test('dashboard, project list and connection metadata share one concurrent snapshot request',async()=>{
  const {api,calls}=setup();
  await Promise.all([api.getProjects(),api.getRecords(),api.getProjects()]);
  assert.deepEqual(calls,['GET']);
  await api.getRecords();assert.equal(calls.length,1);
  await api.getRecords({fresh:true});assert.equal(calls.length,2);
});

test('authenticated bootstrap needs no extra read and confirmed writes each need just one POST',async()=>{
  const {api,calls}=setup({verified:true,authenticated:true});
  api.prime([{project_id:'TEST',status:'active',amount:0,message:''}]);
  await Promise.all([api.getRecords(),api.getProjects()]);assert.equal(calls.length,0);
  await api.updateProject({project_id:'TEST',status:'blocked',amount:2000000,message:'Pago pendiente'});
  assert.deepEqual(calls,['POST']);await api.getRecords();assert.equal(calls.length,1);
  await api.saveRecord({project_id:'__DEVNEX_PAYMENT__test',status:'active',amount:0,message:'encrypted'});
  assert.deepEqual(calls,['POST','POST']);
  await api.deleteProject('TEST');assert.deepEqual(calls,['POST','POST','POST']);
  assert.ok(!(await api.getRecords()).some(r=>r.project_id==='TEST'));
});

test('a fast confirmed response is still rejected when the persisted schedule differs',async()=>{
  const state=setup({verified:true,authenticated:true});state.drop();
  await assert.rejects(()=>state.api.updateProject({project_id:'TEST',status:'warning',amount:1000000,message:'Aviso',deadline_at:new Date(Date.now()+3600000).toISOString()}),/no confirmó/);
  assert.equal(state.messages.length,0);
});
test('editing a connected project needs only a write and one verification read',async()=>{
  const {api,calls,messages}=setup();await api.getRecords();calls.length=0;
  const saved=await api.updateProject({project_id:'TEST',status:'blocked',amount:125000,message:'Pago pendiente'});
  assert.equal(saved.status,'blocked');assert.deepEqual(calls,['POST','GET']);
  assert.equal(messages[0].type,'project-changed');
  await api.getRecords();assert.equal(calls.length,2,'verification snapshot should be reusable by the rest of the interface');
});
test('fast writes still reject an unconfirmed deadline and never broadcast success',async()=>{
  const state=setup();state.drop();
  await assert.rejects(()=>state.api.updateProject({project_id:'TEST',status:'warning',amount:125000,message:'Aviso',deadline_at:new Date(Date.now()+3600000).toISOString()}),/no confirmó/);
  assert.equal(state.messages.length,0);
});
