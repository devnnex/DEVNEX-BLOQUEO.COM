const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const model=require('../js/project-guard.js');
function setup(){
  let rows=[{project_id:'TEST',status:'active',amount:0,message:''}],dropSchedule=false;
  const calls=[],messages=[];
  const app={apiUrl:'https://api.example/exec'},window={DevnexApp:app};
  const fetch=async(url,options)=>{
    calls.push(options.method);await new Promise(resolve=>setTimeout(resolve,5));
    if(options.method==='POST'){const {action,...record}=JSON.parse(options.body);if(dropSchedule)record.message='schedule was dropped';rows=[record,...rows.filter(r=>r.project_id!==record.project_id)];return {ok:true,text:async()=>JSON.stringify({success:true})};}
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
