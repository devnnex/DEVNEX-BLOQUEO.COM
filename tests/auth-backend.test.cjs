const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./backend-fixture.cjs');
test('only the owner with the correct password proof receives a session and existing encryption key',()=>{
  const f=fixture();f.add({project_id:'CLIENT',amount:125000});
  assert.equal(f.request('POST',{action:'login',email:'other@gmail.com',proof:f.proof}).code,'AUTH_INVALID');
  assert.equal(f.request('POST',{action:'login',email:'elkin56ty@gmail.com',proof:crypto.randomBytes(32).toString('base64url')}).code,'AUTH_INVALID');
  const login=f.login();assert.equal(login.success,true);assert.equal(login.owner_key,f.ownerKey);assert.equal(login.projects.length,1);
  const session=f.request('POST',{action:'session',session_token:login.session_token});assert.equal(session.owner_key,f.ownerKey);
  assert.equal(f.request('POST',{action:'session',session_token:login.session_token+'x'}).code,'AUTH_REQUIRED');
  const expired=Buffer.from(JSON.stringify({email:'elkin56ty@gmail.com',expires_at:Date.now()-1})).toString('base64url');
  const signature=crypto.createHmac('sha256',f.secret).update(expired).digest('base64url');
  assert.equal(f.request('POST',{action:'get',session_token:expired+'.'+signature}).code,'AUTH_REQUIRED');
});
test('anonymous users cannot list data, read private records or mutate projects',()=>{
  const f=fixture();f.add({project_id:'CLIENT'});f.add({project_id:'__DEVNEX_PAYMENT__private',message:'encrypted'});
  assert.equal(f.request('GET',{}).code,'AUTH_REQUIRED');
  assert.equal(f.request('GET',{project_id:'__DEVNEX_PAYMENT__private'}).code,'AUTH_REQUIRED');
  assert.equal(f.request('GET',{project_id:'CLIENT'}).success,true);
  for(const action of ['get','create','update','delete'])assert.equal(f.request('POST',{action,project_id:'CLIENT',status:'blocked'}).code,'AUTH_REQUIRED');
  assert.equal(f.state.writes,0);
  assert.equal(f.request('POST',{action:'get',service_key:f.ownerKey}).projects.length,2);
});
test('mutations return a flushed, persisted record and never report a failed write as confirmed',()=>{
  const f=fixture(),session_token=f.login().session_token;
  const record={project_id:'CLIENT',status:'blocked',amount:1500000,message:'=untrusted text'};
  const created=f.request('POST',{action:'create',session_token,...record});
  assert.equal(created.verified,true);assert.deepEqual(created.project,record);assert.equal(f.state.flushes,1);
  f.state.failWrites=true;assert.equal(f.request('POST',{action:'update',session_token,...record,amount:3000000}).success,false);
  assert.equal(f.state.rows[1][2],1500000);f.state.failWrites=false;
  assert.equal(f.request('POST',{action:'delete',session_token,project_id:'CLIENT'}).deleted_id,'CLIENT');
  assert.equal(f.state.rows.length,1);
});
test('legacy admin heartbeat can update only the heartbeat record and failed logins are throttled',()=>{
  const f=fixture();f.add({project_id:'CLIENT'});const connection_id=crypto.randomUUID();
  const body={action:'create',project_id:'__DEVNEX_HEALTH__'+connection_id,status:'active',amount:0,message:JSON.stringify({connection_id,project_id:'CLIENT',repository:'devnnex/CLIENT',admin_only:true,page_path:'/CLIENT/admin.html',origin:'https://devnnex.github.io',seen_at:new Date().toISOString()})};
  assert.equal(f.request('POST',body).success,true);
  assert.equal(f.request('POST',{...body,action:'delete'}).success,false);
  assert.equal(f.request('POST',{...body,status:'blocked'}).success,false);
  for(let i=0;i<10;i++)assert.equal(f.request('POST',{action:'login',email:'wrong',proof:f.proof}).code,'AUTH_INVALID');
  assert.equal(f.login().code,'AUTH_RATE_LIMIT');
});
