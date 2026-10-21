'use strict';
(() => {
  const origin='https://kiwikind-backend.onrender.com';
  const $=id=>document.getElementById(id);
  let csrf='',busy=false,epoch=0;
  const message=text=>{$('notice').textContent=text;};
  const clear=()=>{epoch++;operations?.clear();sandbox?.clear();for(const id of ['signin','mfa','private'])$(id).hidden=true;for(const id of ['checks','catalogue','setup-key','columns','google','stripe-result'])$(id).replaceChildren();$('mfa-form').reset();$('import-form').reset();};
  async function api(path,data){
    const response=await fetch(origin+'/api/'+path,{method:data===undefined?'GET':'POST',credentials:'include',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json','X-CSRFToken':csrf},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(75000)});
    let result;try{result=await response.json();}catch{throw Error('The secure API is unavailable. Retry shortly.');}
    if(!response.ok){if(response.status===401||response.status===403)clear();const fields=Object.entries(result.fields||{}).flatMap(([name,items])=>items.map(e=>name+': '+e.message)).join(' ');throw Error((result.error||'Secure session unavailable. Allow cross-site cookies for this site, then retry.')+(fields?' '+fields:''));}
    if(result.csrfToken)csrf=result.csrfToken;
    return result;
  }
  const action=fn=>async event=>{event?.preventDefault?.();if(busy)return;busy=true;try{await fn(event);}catch(error){message(error.message||'Could not connect. Retry shortly.');}finally{busy=false;}};
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const operations=window.KiwiKindOwnerOps?.create({api,action,node,message});
  const sandbox=window.KiwiKindSandbox?.create({api,action,node,message});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){operations?.clear();sandbox?.clear();}});
  async function refresh(){
    const generation=epoch;
    const [readiness,catalogue]=await Promise.all([api('owner/readiness'),api('owner/catalogue')]);
    if(generation!==epoch||document.hidden)return;
    $('checks').replaceChildren();
    for(const check of readiness.checks){const row=node('div','');row.className='evidence';row.append(node('strong',(check.done?'Evidence recorded · ':'Outstanding · ')+check.label),node('p',check.detail));$('checks').append(row);}
    $('catalogue').replaceChildren();
    for(const plan of catalogue.plans){const row=node('tr','');for(const value of [plan.name,`${plan.network||'Unknown'} · ${plan.download_mbps??'?'} / ${plan.upload_mbps??'?'} Mbps`,plan.wholesale_ex_gst??'Unknown',plan.retail_ex_gst??'Unapproved',plan.review_status])row.append(node('td',String(value)));$('catalogue').append(row);}
    if(!catalogue.plans.length){const row=node('tr','');const cell=node('td','No private quotes recorded.');cell.colSpan=5;row.append(cell);$('catalogue').append(row);}
    $('columns').textContent=catalogue.csv_columns.join(',');
    $('private').hidden=false;await operations?.load();await sandbox?.load();message('Owner Google proof and MFA verified. Private evidence loaded.');
  }
  async function init(){
    clear();message('Checking secure session…');
    await api('bootstrap');await api('pages/cookie-probe',{});
    if(!(await api('pages/session-probe')).session_cookie)throw Error('Your browser blocked the secure session cookie. Allow cross-site cookies for this site, then retry.');
    const state=await api('owner/state');
    if(!state.enabled)throw Error('Owner administration is unavailable.');
    if(state.mfa_verified){await refresh();return;}
    if(state.identity_verified){
      // A fresh document means the Google script never shares an MFA/catalogue document.
      if(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')){location.reload();return;}
      const factor=await api('owner/mfa');$('mfa').hidden=false;
      $('setup-info').textContent=factor.enrolling?'Add the key below to your authenticator as KiwiKind Broadband, then verify a code. Keep the key private.':'Enter the current code from your existing authenticator.';
      $('setup-key').textContent=factor.setup_key||'';message('Complete authenticator verification.');return;
    }
    const challenge=await api('owner/challenge',{});$('signin').hidden=false;
    const render=()=>{
      google.accounts.id.initialize({client_id:challenge.client_id,nonce:challenge.nonce,ux_mode:'popup',auto_select:false,callback:action(async response=>{await api('owner/signin',{credential:response.credential});location.reload();})});
      google.accounts.id.renderButton($('google'),{theme:'outline',size:'large',width:260});
      message('Sign in with the owner Google account. The challenge expires in five minutes.');
    };
    if(window.google?.accounts?.id){render();return;}
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=render;script.onerror=()=>message('Google sign-in unavailable. Retry shortly.');document.head.append(script);
  }
  $('mfa-form').addEventListener('submit',action(async event=>{await api('owner/mfa',{code:event.target.elements.code.value});$('setup-key').replaceChildren();event.target.reset();$('mfa').hidden=true;await refresh();}));
  $('import-form').addEventListener('submit',action(async event=>{const file=event.target.elements.csv.files[0];if(!file||file.size>12000||!file.name.toLowerCase().endsWith('.csv'))throw Error('Choose a CSV file no larger than 12 KB.');const result=await api('owner/catalogue',{csv:await file.text(),confirm_draft_only:event.target.elements.confirm.checked});event.target.reset();await refresh();message(result.message);}));
  $('logout').addEventListener('click',action(async()=>{await api('logout',{});clear();location.reload();}));
  $('refresh').addEventListener('click',action(refresh));$('retry').addEventListener('click',action(init));
  $('stripe-check').addEventListener('click',action(async()=>{const generation=epoch;const result=await api('owner/stripe-evidence',{});if(generation!==epoch)return;$('stripe-result').textContent=result.verified?`${result.detail} Paid invoice: ${result.initial_paid_invoice?'confirmed':'not confirmed'}. Full refund: ${result.full_refund?'confirmed':'not confirmed'}. Cancellation: ${result.cancellation?'confirmed':'not confirmed'}.`:result.detail;}));
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();message('Private view cleared while away. Retry to restore it.');}else if(!busy)void action(init)();});
  setInterval(()=>{if(!document.hidden&&!$('private').hidden&&!busy)void action(refresh)();},30000);
  void action(init)();
})();
