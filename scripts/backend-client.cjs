/* Credentials travel in POST bodies, never in URLs or logs. */
function backendClient(apiUrl,serviceKey) {
  return async function request(action,payload={}) {
    const response=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,...payload,service_key:serviceKey}),signal:AbortSignal.timeout(20000)});
    let data=await response.json();
    // Only old deployments lack the read action. This permits staging the server upgrade.
    if(action==='get'&&response.ok&&data.success===false&&data.message==='INVALID ACTION'){
      const legacy=await fetch(apiUrl+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});
      data=await legacy.json();if(!legacy.ok)throw new Error('No se pudo consultar Apps Script.');
    }
    if(!response.ok||data.error||data.success===false)throw new Error('No se pudo sincronizar con Apps Script.');
    return data;
  };
}
module.exports={backendClient};
