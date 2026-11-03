const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function fixture(options={}){
  const ownerKey=options.ownerKey||crypto.randomBytes(32).toString('base64url'),password=options.password||'A-test-password-2026!',salt=crypto.randomBytes(32).toString('base64url'),secret=crypto.randomBytes(32).toString('base64url');
  const proof=crypto.pbkdf2Sync(password,Buffer.from(salt,'base64url'),600000,32,'sha256').toString('base64url');
  const properties={DEVNEX_OWNER_KEY:ownerKey,DEVNEX_AUTH_SALT:salt,DEVNEX_AUTH_SECRET:secret,DEVNEX_AUTH_VERIFIER:crypto.createHmac('sha256',secret).update(proof).digest('base64url')};
  const state={rows:[['project_id','status','amount','message']],writes:0,reads:0,flushes:0,failWrites:false},cache=new Map();
  const blob=value=>({getBytes:()=>Buffer.from(value),getDataAsString:()=>Buffer.from(value).toString('utf8')});
  const sheet={getDataRange:()=>({getValues:()=>{state.reads++;return state.rows.map(r=>[...r]);}}),getLastRow:()=>state.rows.length,
    deleteRow:index=>{if(state.failWrites)throw new Error('write failed');state.writes++;state.rows.splice(index-1,1);},
    getRange:(row,col,rows=1,cols=1)=>({setValues:values=>{
      if(state.failWrites)throw new Error('write failed');state.writes++;
      values.forEach((r,i)=>{state.rows[row-1+i]||=[];r.forEach((value,j)=>{state.rows[row-1+i][col-1+j]=typeof value==='string'&&value.startsWith("'")?value.slice(1):value;});});
    },getValues:()=>Array.from({length:rows},(_,i)=>state.rows[row-1+i].slice(col-1,col-1+cols))})};
  const sandbox={console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]})},
    Utilities:{Charset:{UTF_8:'utf8'},newBlob:blob,base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'),base64DecodeWebSafe:value=>Buffer.from(value,'base64url'),computeHmacSha256Signature:(value,key)=>crypto.createHmac('sha256',key).update(value).digest(),getUuid:()=>crypto.randomUUID()},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({value,setMimeType(){return this;}})},
    SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),flush:()=>state.flushes++},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:key=>{const entry=cache.get(key);return entry&&entry.expires>Date.now()?entry.value:null;},put:(key,value,ttl)=>cache.set(key,{value,expires:Date.now()+ttl*1000}),remove:key=>cache.delete(key)})}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/Code.gs'),'utf8'),sandbox);
  const request=(method,params)=>JSON.parse((method==='GET'?sandbox.doGet({parameter:params}):sandbox.doPost({postData:{contents:JSON.stringify(params)}})).value);
  const add=record=>state.rows.push([record.project_id,record.status||'active',record.amount||0,record.message||'']);
  return {request,add,state,properties,proof,password,salt,secret,ownerKey,cache,login:()=>request('POST',{action:'login',email:'elkin56ty@gmail.com',proof})};
}
module.exports={fixture};
