const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),http=require('node:http');
const model=require('../js/repository-model.js'),store=require('../js/private-store.js');
const htmlTools=require('../scripts/connector-html.cjs'),{install,run}=require('../scripts/connect-repositories.cjs');
const html='<!doctype html><html><head><meta charset="utf-8"><script>const s="</head>";</script></head><body><h1>Cliente</h1></body></html>';
const makeConnection=()=>({repository:'devnnex/DON-PIEROS-PIZZA-BCA.COM',project_id:'DON-PIEROS-PIZZA-BCA.COM',request_id:'11111111-1111-4111-8111-111111111111',heartbeat_id:'__DEVNEX_HEALTH__11111111-1111-4111-8111-111111111111',phase:'queued'});
test('name, full GitHub link and owner/name identify the same client repository',()=>{
  const expected=model.parse('DON-PIEROS-PIZZA-BCA.COM');
  for(const value of ['https://github.com/devnnex/DON-PIEROS-PIZZA-BCA.COM','devnnex/DON-PIEROS-PIZZA-BCA.COM','https://github.com/devnnex/DON-PIEROS-PIZZA-BCA.COM.git/'])assert.deepEqual(model.parse(value),expected);
  assert.equal(model.existingId(expected.repository,[{project_id:'DON-PIEROS-PIZZA-BCA'}]),'DON-PIEROS-PIZZA-BCA');
});
test('unrelated owners, unsafe URLs and the control console cannot be connected as clients',()=>{
  for(const value of ['https://evil.example/devnnex/CLIENT','https://github.com/other/CLIENT','../CLIENT','DEVNEX-BLOQUEO.COM','https://github.com/devnnex/CLIENT/tree/main','https://user:pass@github.com/devnnex/CLIENT','https://github.com:443/devnnex/CLIENT/../../other/CLIENT'])assert.throws(()=>model.parse(value));
});
test('HTML injection preserves source and inline code, removes the legacy duplicate, and is idempotent',()=>{
  const connection=makeConnection();
  const source=html.replace('</body>','<script>const project_id="OLD-ID";</script><script src="https://devnnex.github.io/DEVNEX-BLOQUEO.COM/js/project-guard.js"></script></body>');
  const first=htmlTools.inject(source,connection,'https://devnnex.github.io/CLIENT/');
  assert.ok(first.includes('const s="</head>";'));assert.ok(first.includes('const project_id="OLD-ID";'));
  assert.equal((first.match(/js\/project-guard\.js/g)||[]).length,1);
  assert.equal(htmlTools.installed(first,connection),true);
  assert.equal(htmlTools.inject(first,connection,'https://devnnex.github.io/CLIENT/'),first);
});
test('connector respects CSP instead of silently broadening script permissions',()=>{
  const source=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="script-src \'self\'">');
  assert.throws(()=>htmlTools.inject(source,makeConnection(),'https://client.example/'),/política/);
  assert.ok(htmlTools.inject(source,makeConnection(),'https://devnnex.github.io/CLIENT/'));
});
test('green LED requires a matching execution receipt; stale and unrelated receipts do not show online',()=>{
  const connection=makeConnection(),now=Date.now(),receipt={connection_id:connection.request_id,project_id:connection.project_id,repository:connection.repository,seen_at:new Date(now).toISOString()};
  assert.equal(model.led(connection,null,now).tone,'pending');
  assert.equal(model.led(connection,receipt,now).tone,'online');
  assert.equal(model.led(connection,{...receipt,connection_id:'another'},now).tone,'pending');
  assert.equal(model.led(connection,{...receipt,repository:[]},now).tone,'pending');
  assert.equal(model.led(connection,receipt,now+181000).tone,'idle');
  assert.equal(model.led({...connection,phase:'error'},receipt,now).tone,'error');
});
function githubFixture(){
  const writes=[];let treeChanges=[];
  const api=async(path,method='GET',body)=>{
    if(method!=='GET'){writes.push({path,method,body});if(path.endsWith('/git/trees')){treeChanges=body.tree;return {sha:'new-tree'};}if(path.endsWith('/git/commits'))return {sha:'new-commit'};return {};}
    if(path.endsWith('/DON-PIEROS-PIZZA-BCA.COM'))return {name:'DON-PIEROS-PIZZA-BCA.COM',owner:{login:'devnnex'},full_name:makeConnection().repository,default_branch:'main',permissions:{push:true}};
    if(path.endsWith('/pages'))return {source:{branch:'main',path:'/'},build_type:'legacy',html_url:'https://devnnex.github.io/DON-PIEROS-PIZZA-BCA.COM/'};
    if(path.includes('/git/ref/heads/'))return {object:{sha:'old-commit'}};
    if(path.includes('/git/commits/'))return {tree:{sha:'old-tree'}};
    if(path.includes('/git/trees/'))return {tree:[{path:'index.html',mode:'100644',type:'blob',sha:'index',size:html.length},{path:'admin.html',mode:'100644',type:'blob',sha:'admin',size:html.length},{path:'sw.js',mode:'100644',type:'blob',sha:'sw',size:50},{path:'js/app.js',mode:'100644',type:'blob',sha:'application',size:20}]};
    if(path.includes('/git/blobs/'))return {content:Buffer.from(path.endsWith('/sw')?'const CACHE="v1";':html).toString('base64')};
    throw new Error('Unexpected test path '+path);
  };
  return {api,writes,get changes(){return treeChanges;}};
}
test('installer changes only HTML and SW cache revision in one non-forced commit',async()=>{
  const github=githubFixture(),result=await install(makeConnection(),github);
  assert.deepEqual(result.files,['index.html','admin.html','sw.js']);
  assert.equal(github.writes.length,3);assert.equal(github.writes.at(-1).body.force,false);
  assert.ok(github.changes.filter(c=>c.path.endsWith('.html')).every(c=>htmlTools.installed(c.content,makeConnection())));
  assert.ok(!github.changes.some(c=>c.path==='js/app.js'));
});
test('background connection runner authenticates requests and reports publication without fabricating a heartbeat',async()=>{
  const key=crypto.randomBytes(32).toString('base64url'),connection=makeConnection();
  const configuration={ownerKeyHash:crypto.createHash('sha256').update(key).digest('base64url')};
  const id=model.PREFIX+crypto.createHash('sha256').update(connection.repository.toLowerCase()).digest('base64url').slice(0,32);
  let rows=[{project_id:connection.project_id,status:'active',amount:0,message:''},await store.seal(id,connection,key)];
  const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.setHeader('Content-Type','application/json');if(req.method==='GET'){res.end(JSON.stringify({success:true,projects:rows}));return;}const {action,...value}=JSON.parse(body);rows=[value,...rows.filter(r=>r.project_id!==value.project_id)];res.end(JSON.stringify({success:true}));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const options={ownerKey:key,configuration,apiUrl:`http://127.0.0.1:${server.address().port}`,github:githubFixture(),fetchSite:async()=>({ok:true,text:async()=>htmlTools.inject(html,connection,'https://devnnex.github.io/CLIENT/')})};
  try{
    const first=await run(options);assert.equal(first.installed,1);assert.equal(first.confirmed,0);
    assert.equal((await store.open(rows.find(r=>r.project_id===id),key)).phase,'awaiting_client');
    rows.push({project_id:connection.heartbeat_id,status:'active',amount:0,message:JSON.stringify({connection_id:connection.request_id,project_id:connection.project_id,repository:connection.repository,origin:'https://devnnex.github.io',seen_at:new Date().toISOString()})});
    const second=await run(options);assert.equal(second.installed,0);assert.equal(second.confirmed,1);
    assert.equal((await store.open(rows.find(r=>r.project_id===id),key)).phase,'connected');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
