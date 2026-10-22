'use strict';
const $ = id => document.getElementById(id);
const consentVersion = 'prelaunch-2026-10-16';
let csrfToken = '', registration = false, backend = false, intake = false, registrationEnabled = false;
let orderKey = null;
let resetToken = '';
let lastAccountSync = 0;
let accountSyncInFlight = false;
let accountGeneration = 0;
let restoringSession = true, initInFlight = false, authPending = false;
let preferencesLoaded = false;
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
async function api(path, data, generation = accountGeneration) {
  let response;
  try { response = await fetch('https://kiwikind-backend.onrender.com/api/' + path, {method: data === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store', redirect: 'error', headers: {'Content-Type':'application/json', 'X-CSRFToken':csrfToken}, ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? {signal:AbortSignal.timeout(75000)} : {}), ...(data === undefined ? {} : {body:JSON.stringify(data)})}); }
  catch { throw new Error(data === undefined ? 'Could not reach KiwiKind. Check your connection and retry shortly; the free server may be waking up.' : 'The response was interrupted. Your request may have reached KiwiKind. Refresh your account before trying again.'); }
  let result; try { result = await response.json(); } catch { throw new Error('The customer backend returned an unavailable response. Refresh before trying again.'); }
  if (!response.ok) {
    if (generation === accountGeneration && response.status === 401 && path !== 'login' && path !== 'google-login' && !$('dashboard').classList.contains('hidden')) showSignedOut();
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  if (generation === accountGeneration && result.csrfToken) csrfToken = result.csrfToken;
  return result;
}
function showSignedOut() {
  document.body.classList.remove('dashboard-open');
  accountGeneration++;
  lastAccountSync = 0;
  updateAccountNavigation(false);
  $('dashboard').classList.add('hidden');
  $('auth-area').classList.remove('hidden');
  $('signed-in-bar').classList.add('hidden');
  $('signed-in-email').textContent='';
  $('account-email').textContent='';
  $('owner-admin-link')?.remove();
  $('continue-plan')?.remove();
  for(const id of ['auth-form','order-form','ticket-form','deletion-form','preferences-form','reset-request-form'])$(id)?.reset();
  preferencesLoaded=false;
  $('save-preferences').disabled=true;
  $('account-notifications').disabled=true;
  for (const id of ['orders','tickets','invoices','live-payments','referral-result','connection-progress']) $(id)?.replaceChildren();
  if($('account-notifications'))$('account-notifications').checked=false;
  if($('confirm-google-deletion'))$('confirm-google-deletion').checked=false;
  if($('create-referral'))$('create-referral').disabled=false;
  location.hash='#signin';
}
function formData(form) { return Object.fromEntries(new FormData(form)); }
function safeAction(fn) { return async event => { event?.preventDefault(); try { await fn(event); } catch (error) { notice(error.message, true); } }; }
function node(tag, value) { const el = document.createElement(tag); el.textContent = value; return el; }
function empty(id, message) { $(id).replaceChildren(node('p',message)); }
function record(parent, title, subtitle) { const el=node('div',''); el.className='record'; el.append(node('strong',title),node('small',subtitle)); parent.append(el); return el; }
function button(label, action) { const b=node('button',label); b.className='textbutton'; b.type='button'; b.addEventListener('click',safeAction(action)); return b; }
function date(value) { return new Date(value).toLocaleDateString('en-NZ'); }
async function refresh(savedAccount) {
  const generation = ++accountGeneration;
  const me=savedAccount || await api('me', undefined, generation);
  if (generation !== accountGeneration) return;
  lastAccountSync = Date.now();
  document.body.classList.add('dashboard-open');
  updateAccountNavigation(true); document.body.classList.remove('account-open','signup-view'); if(location.hash==='#signin'||location.hash==='#signup'){history.replaceState(null,'',location.pathname+location.search);} $('auth-area').classList.add('hidden'); $('dashboard').classList.remove('hidden'); $('account-email').textContent=me.email; $('signed-in-email').textContent=me.email; $('signed-in-bar').classList.remove('hidden');
  $('owner-admin-link')?.remove();
  $('continue-plan')?.remove();
  const chosen=new URLSearchParams(location.search);
  if(/^[a-z0-9-]{1,30}$/.test(chosen.get('plan')||'')&&/^[0-9,]{1,30}$/.test(chosen.get('options')||'')){
    const link=node('a','Continue with your chosen broadband plan →');link.id='continue-plan';link.className='button';
    link.href='./broadband.html?'+new URLSearchParams({plan:chosen.get('plan'),options:chosen.get('options')});
    $('signed-in-bar').append(link);
  }
  const results=await Promise.allSettled([api('orders', undefined, generation),api('tickets', undefined, generation),api('invoices', undefined, generation)]);
  if (generation !== accountGeneration) {
    if (results.some(r=>r.status==='rejected' && r.reason?.status===401)) throw new Error('Please sign in again.');
    return;
  }
  // A session can expire between /me and parallel detail requests. Do not repopulate cleared private data.
  if(results.some(r=>r.status==='rejected' && r.reason?.status===401)) { showSignedOut(); throw new Error('Please sign in again.'); }
  const [orders,tickets,invoices]=results.map(r=>r.status==='fulfilled'?r.value:null);
  if(results.some(r=>r.status==='rejected')) notice('You are still signed in, but some account details could not load. Use Refresh account to retry.',true);
  empty('orders',orders?'No requests yet.':'Requests temporarily unavailable.'); if(orders?.orders?.length) $('orders').replaceChildren();
  for(const order of orders?.orders || []) {
    const el=record($('orders'),order.address, `${order.status} · ${date(order.created_at)} · ${order.id}`);
    if(order.broadband){
      const q=order.broadband,money=n=>new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(n/100);
      el.append(node('strong',q.name),node('p',q.options.map(o=>o.group+': '+o.name).join(' · ')),
        node('p',money(q.monthly_cents)+'/month · '+(q.setup_cents===null?'Setup to confirm':money(q.setup_cents)+' setup once')+' · GST included'));
      if(order.status!=='cancelled')el.append(node('p',order.payment_offer_available?'Your final offer is available under Billing. Review it before payment.':'Awaiting address and connection confirmation. No payment is due yet.'));
    }
    if(order.status!=='cancelled'&&order.can_cancel_request!==false) el.append(button('Cancel request',async()=>{await api(`orders/${order.id}/cancel`,{}); await refresh(); notice('Request cancelled.');}));
  }
  empty('tickets',tickets?'No conversations yet.':'Conversations temporarily unavailable.'); if(tickets?.tickets?.length) $('tickets').replaceChildren();
  for(const ticket of tickets?.tickets || []) {
    const el=record($('tickets'),ticket.subject,`${ticket.category} · ${ticket.status}`);
    el.append(button('Read & reply',async()=>{
      const data=await api(`tickets/${ticket.id}/messages`, undefined, generation);
      if (generation !== accountGeneration) return;
      const conversation=node('div','');
      for(const m of data.messages) conversation.append(node('small',`${m.from_support?'Support':'You'} · ${date(m.created_at)}`),node('p',m.body));
      const form=node('form',''), label=node('label','Your reply'), input=document.createElement('textarea'); input.required=true; input.maxLength=4000; label.append(input);form.append(label);
      const submit=node('button','Send reply');submit.className='button';submit.type='submit';form.append(submit);
      form.addEventListener('submit',safeAction(async()=>{await api(`tickets/${ticket.id}/messages`,{body:input.value});await refresh();notice('Reply recorded.');}));
      conversation.append(form);el.replaceChildren(node('strong',ticket.subject),conversation);
    }));
  }
  void refreshLivePayments(generation);
  empty('invoices',invoices?'':'Other billing information temporarily unavailable.');
  if(invoices?.invoices?.length)$('invoices').replaceChildren();
  for(const i of invoices?.invoices || []) record($('invoices'),new Intl.NumberFormat('en-NZ',{style:'currency',currency:i.currency}).format(i.amount_cents/100),`${i.status} · Due ${i.due_date}`);
  $('order-submit').disabled=!intake;
  $('refresh-account')?.classList.remove('hidden');
}
$('toggle-auth').addEventListener('click',()=>{registration=!registration;$('auth-title').textContent=registration?'Create your account':'Welcome back';$('auth-submit').textContent=registration?'Create account ↗':'Sign in ↗';$('register-consent').classList.toggle('hidden',!registration);$('auth-form').elements.password.autocomplete=registration?'new-password':'current-password';$('auth-submit').disabled=!backend || (registration&&!registrationEnabled);});
$('auth-form').addEventListener('submit',safeAction(async e=>{
  if(authPending||!backend)return;
  authPending=true;$('auth-submit').disabled=true;
  try{
    const d=formData(e.target);
    if(registration){if(!d.consent)throw new Error('Please accept the pre-launch terms.');const r=await api('register',{...d,consent_version:consentVersion});notice(r.message);location.hash='#signin';}
    else{notice('Signing in. Please wait for your account to load.');await api('login',d);await refresh();notice('You’re signed in.');}
  }finally{authPending=false;$('auth-submit').disabled=!backend||(registration&&!registrationEnabled);}
}));
$('forgot').addEventListener('click',()=>{if(!backend){notice('Password reset is available when the customer backend is connected.',true);return;}const email=$('auth-form').elements.email.value;$('reset-request-form').elements.email.value=email;$('auth-form').classList.add('hidden');$('reset-request-form').classList.remove('hidden');$('reset-request-form').elements.email.focus();});
$('reset-request-back').addEventListener('click',()=>{$('reset-request-form').classList.add('hidden');$('auth-form').classList.remove('hidden');});
$('reset-request-form').addEventListener('submit',safeAction(async e=>{const email=e.target.elements.email.value.trim();notice((await api('password-reset',{email})).message);}));
$('reset-form').addEventListener('submit',safeAction(async e=>{
  const result=await api('password-reset/confirm',{token:resetToken,password:formData(e.target).password});
  resetToken='';e.target.reset();$('reset-form').classList.add('hidden');$('auth-form').classList.remove('hidden');
  showSignedOut();csrfToken=(await api('csrf')).csrfToken;notice(result.message);
}));
$('reset-back').addEventListener('click',()=>{resetToken='';$('reset-form').reset();$('reset-form').classList.add('hidden');$('auth-form').classList.remove('hidden');});
$('logout').addEventListener('click',safeAction(async()=>{accountGeneration++;await api('logout',{});showSignedOut();$('auth-form').reset();notice('Signed out.');csrfToken=(await api('csrf')).csrfToken;}));
$('order-form').addEventListener('submit',safeAction(async e=>{const d=formData(e.target);orderKey ||= crypto.randomUUID();const r=await api('orders',{...d,idempotency_key:orderKey,consent_version:consentVersion});orderKey=null;e.target.reset();await refresh();notice(r.message);}));
$('order-form').addEventListener('input',()=>{orderKey=null;});
$('ticket-form').addEventListener('submit',safeAction(async e=>{const r=await api('tickets',formData(e.target));e.target.reset();await refresh();notice(r.message);}));
$('deletion-form').addEventListener('submit',safeAction(async e=>{notice((await api('privacy/deletion',formData(e.target))).message);e.target.reset();}));
$('refresh-account')?.addEventListener('click',safeAction(async()=>{await refresh();notice('Account details refreshed.');}));
$('top-logout').addEventListener('click',()=> $('logout').click());
$('top-refresh').addEventListener('click',()=> $('refresh-account').click());
$('export').addEventListener('click',safeAction(async()=>{
  const generation=accountGeneration;
  const data=await api('privacy/export',undefined,generation);
  if(generation!==accountGeneration||$('dashboard').classList.contains('hidden'))return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='kiwikind-data.json';a.hidden=true;document.body.append(a);a.click();
  setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},1000);
  notice('Your data export is ready.');
}));
async function init(){
  if(initInFlight)return;
  initInFlight=true;restoringSession=true;$('retry-connection').disabled=true;
  backend=false;
  $('auth-submit').disabled=true;$('forgot').disabled=true;
  $('google-signin').parentElement.classList.add('hidden');
  const startupMessage='Checking your saved session. The free server may take about a minute to wake up.';
  notice(startupMessage);
  const initGeneration=accountGeneration;
  try{
    const s=await api('bootstrap',undefined,initGeneration);
    if(initGeneration!==accountGeneration)return;
    await api('pages/cookie-probe',{});
    if(!(await api('pages/session-probe')).session_cookie)throw Error('Session cookie blocked');
    intake=s.intake_enabled;registrationEnabled=s.registration_enabled===true;
    $('connection-status').textContent=s.broadband_ordering_enabled?'Broadband plans open · pay after confirmation':registrationEnabled?'Accounts open · payment follows connection confirmation':'Portal connected · account registration is closed';
    if(s.legal_entity && s.business_contact && s.privacy_contact)$('legal-identity').textContent=`Operator: ${s.legal_entity}. Business contact: ${s.business_contact}. Privacy contact: ${s.privacy_contact}. Broadband payments follow connection confirmation.`;
    $('toggle-auth').disabled=false;
    $('retry-connection').classList.add('hidden');
    const hash=location.hash;
    if(hash.startsWith('#verify=')){const token=decodeURIComponent(hash.slice(8));history.replaceState(null,'','#portal');notice((await api('verify',{token})).message);}
    if(hash.startsWith('#reset=')){
      const token=decodeURIComponent(hash.slice(7));
      history.replaceState(null,'','#signin');routeAccount();resetToken=token;
      $('auth-form').classList.add('hidden');$('reset-form').classList.remove('hidden');
      backend=true;$('auth-submit').disabled=registration&&!registrationEnabled;
      $('forgot').disabled=false;
      $('google-signin').parentElement.classList.remove('hidden');setupGoogleSignIn();
      notice('Choose a new password using your reset link.');
      return;
    }
    if(!s.account && !$('dashboard').classList.contains('hidden'))showSignedOut();
    try{if(s.account)await refresh(s.account);if(location.hash==='#portal')$('portal').scrollIntoView({block:'start'}); if(!location.hash){window.scrollTo(0,0);}}catch(error){
      if(error.status!==401)throw error;
      updateAccountNavigation(false);$('dashboard').classList.add('hidden');$('auth-area').classList.remove('hidden');$('signed-in-bar').classList.add('hidden');
    }
    backend=true;$('auth-submit').disabled=registration&&!registrationEnabled;
    $('forgot').disabled=false;
    $('google-signin').parentElement.classList.remove('hidden');setupGoogleSignIn();
    if($('notice').textContent===startupMessage)notice($('dashboard').classList.contains('hidden')?(registration&&!registrationEnabled?'Email registration is closed during pre-launch. Existing users can return to sign in.':'Ready to sign in.'): 'Your saved account is signed in.');
  }catch{ backend=false;$('retry-connection').classList.remove('hidden'); notice('KiwiKind could not establish a secure session. Retry after the server wakes up. If cookies are blocked, allow cross-site cookies for this site and try again. Some browsers cannot support this sign-in configuration.',true);$('connection-status').textContent='Customer backend temporarily unavailable';$('auth-submit').disabled=true;$('toggle-auth').disabled=true;$('forgot').disabled=true; }
  finally{initInFlight=false;restoringSession=false;$('retry-connection').disabled=false;if(backend&&!resetToken)routeAccount();}
}
$('retry-connection').addEventListener('click',safeAction(init));
init();

function setupGoogleSignIn(){
  if(document.querySelector('script[src="https://accounts.google.com/gsi/client"]'))return;
  const clientId='956119315558-mgaqlpnfr9r0ic9n4jtb284gaa4n7i61.apps.googleusercontent.com';
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>{
    if(!window.google?.accounts?.id)return;
    google.accounts.id.initialize({client_id:clientId,ux_mode:'popup',callback:async response=>{if(authPending)return;authPending=true;try{await api('google-login',{id_token:response.credential});await refresh();notice('You’re signed in.');}catch(error){notice(error.message,true);}finally{authPending=false;}}});
    const renderGoogleButton=()=>{
      const host=$('google-signin');
      const available=host.clientWidth || document.documentElement.clientWidth-84;
      host.replaceChildren();
      google.accounts.id.renderButton(host,{theme:'filled_black',shape:'pill',size:'large',text:'signin_with',logo_alignment:'left',width:Math.max(200,Math.min(280,available))});
    };
    renderGoogleButton();
    window.addEventListener('resize',renderGoogleButton);
  };
  script.onerror=()=>{script.remove();$('retry-connection').classList.remove('hidden');notice('Google sign-in is unavailable. Retry the connection to try Google again, or use email sign-in.',true);};
  document.head.append(script);
}

// Top navigation switches directly to the requested account form.
function updateAccountNavigation(signedIn){$('nav-signin').classList.toggle('hidden',signedIn);$('nav-signup').classList.toggle('hidden',signedIn);$('nav-account').classList.toggle('hidden',!signedIn);}
function selectAccountForm(signUp){
  $('reset-request-form').classList.add('hidden');$('auth-form').classList.remove('hidden');
  if(registration!==signUp)$('toggle-auth').click();
  document.body.classList.toggle('signup-view',signUp);
  $('back-to-login').classList.toggle('hidden',!signUp);
  if(backend&&signUp&&!registrationEnabled)notice('Email registration is closed during pre-launch. Existing users can return to sign in.');
  else if(backend&&$('notice').textContent.startsWith('Email registration is closed'))notice('Ready to sign in.');
}
function routeAccount(){
  const hash=location.hash;
  if(resetToken){resetToken='';$('reset-form').reset();$('reset-form').classList.add('hidden');$('auth-form').classList.remove('hidden');}
  if(hash==='#portal' && $('dashboard').classList.contains('hidden')){if(!restoringSession)location.hash='#signin';return;}
  if(!$('dashboard').classList.contains('hidden') && (hash==='#signin'||hash==='#signup')){
    history.replaceState(null,'',location.pathname+location.search);
    document.body.classList.remove('account-open','signup-view');
    window.scrollTo(0,0);
    return;
  }
  document.body.classList.toggle('account-open',hash==='#signup'||hash==='#signin');
  if(hash==='#signup'||hash==='#signin'){
    selectAccountForm(hash==='#signup');
    $('auth-area').scrollIntoView({block:'start'});
  }else if(!registration){document.body.classList.remove('signup-view');$('back-to-login').classList.add('hidden');}
}
window.addEventListener('hashchange',routeAccount);
for(const id of ['nav-signin','nav-signup'])$(id).addEventListener('click',()=>{if(location.hash===$(id).hash)routeAccount();});
routeAccount();

// Refresh shared account data after returning from Android, another tab, or a network interruption.
// Keep the existing dashboard visible if a temporary request fails.
async function syncAccountOnReturn() {
  if (document.hidden || !backend || accountSyncInFlight || $('dashboard').classList.contains('hidden')) return;
  if (Date.now() - lastAccountSync < 15000) return;
  accountSyncInFlight = true;
  try { await refresh(); }
  catch (error) { notice(error.status===401 || $('dashboard').classList.contains('hidden') ? 'Please sign in again.' : 'Account refresh is temporarily unavailable. Your existing account view is preserved.', true); }
  finally { accountSyncInFlight = false; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncAccountOnReturn(); });
window.addEventListener('focus', () => { void syncAccountOnReturn(); });
window.addEventListener('online', () => { void syncAccountOnReturn(); });

// Read-only wholesale preparation, shared with Android. Supplier notes and draft prices stay private.
function preparationLabel(stage) {
  return ({draft:'Preparation started', availability_review:'Availability evidence under review',
    quote_review:'Draft quote under review', ready:'Prepared — awaiting launch approval',
    cancelled:'Request cancelled', triage:'KiwiKind reviewing support',
    resolved:'Support review resolved', closed:'Review closed'})[stage] || 'Awaiting an update from KiwiKind';
}
async function loadConnectionProgress() {
  const generation = accountGeneration;
  const control = $('load-connection-progress');
  control.disabled = true;
  empty('connection-progress', 'Loading preparation updates…');
  try {
    const data = await api('connection-progress', undefined, generation);
    if (generation !== accountGeneration) return;
    empty('connection-progress', data.message);
    for (const item of data.orders || []) record($('connection-progress'), preparationLabel(item.stage), `Request ${item.request_id} · ${date(item.updated_at)}`);
    for (const item of data.faults || []) record($('connection-progress'), preparationLabel(item.stage), `Support ${item.ticket_id} · ${date(item.updated_at)}`);
    if (!(data.orders?.length || data.faults?.length)) $('connection-progress').append(node('p', 'No preparation updates yet.'));
  } catch (error) {
    if (generation === accountGeneration) empty('connection-progress', 'Updates could not load. Your account is preserved. Reconnect and tap Refresh preparation.');
  } finally { control.disabled = false; }
}
$('load-connection-progress')?.addEventListener('click', safeAction(loadConnectionProgress));
window.addEventListener('offline', () => {
  notice('You are offline. Reconnect before refreshing or sending anything. Your saved login is kept.', true);
});

// Private data is never retained in browser history snapshots.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});

// Only the signed-in server ledger supplies payment totals. Browser returns
// never mark an invoice paid; refresh receives reconciled Stripe updates.
function liveMoney(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw Error('Invalid payment amount. Contact KiwiKind.');
  return new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(cents/100);
}
function liveCheckoutUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&u.pathname.startsWith('/c/pay/cs_live_')&&!/[\s\\]/.test(value);}catch{return false;}
}
async function refreshLivePayments(generation=accountGeneration) {
  const target=$('live-payments');if(!target)return;
  try {
    const result=await api('payments/summary',undefined,generation);
    if(generation!==accountGeneration)return;
    target.replaceChildren();
    if(result.mode!=='live')throw Error('Unexpected payment mode. Nothing was submitted.');
    if(!result.agreements?.length){target.append(node('p','No approved payment offer is assigned to your account.'));return;}
    for(const a of result.agreements){
      const monthly=liveMoney(a.monthly_cents),setup=liveMoney(a.setup_cents);
      const card=node('section','');card.className='record';
      card.append(node('h4',a.label),node('p',`${monthly} per month and ${setup} setup once. First payment: ${liveMoney(a.monthly_cents+a.setup_cents)}. All amounts include GST.`),node('p','These totals already include the $3 monthly addition and $10 one-time setup addition. No extra GST is added to either addition.'),node('p',a.service_terms),node('p',`Payment can begin: ${a.bill_from||'To confirm'}. Status: ${a.status}${a.cancel_at_period_end?' · future billing cancellation requested':''}`));
      if(result.live_payments_enabled&&a.ready_to_pay&&a.status==='pending'){
        const label=node('label','');label.className='check';
        const consent=document.createElement('input');consent.type='checkbox';
        label.append(consent,document.createTextNode(`I accept these terms and authorise ${monthly} every month plus ${setup} once. My account email and agreement reference will be sent to Stripe. Payment does not automatically activate broadband.`));card.append(label);
        const pay=button('Continue to secure Stripe checkout',async()=>{
          if(!consent.checked)throw Error('Please accept the displayed recurring payment terms first.');
          pay.disabled=true;
          try{
            const reply=await api('payments/checkout',{agreement_id:a.id,terms_version:a.terms_version,accept_live_recurring:true},generation);
            if(generation!==accountGeneration)return;
            if(reply.livemode!==true||!liveCheckoutUrl(reply.url))throw Error('Unrecognised payment destination. Nothing opened.');
            location.assign(reply.url);
          }finally{if(generation===accountGeneration)pay.disabled=false;}
        });card.append(pay);
      }
      if(a.can_manage&&!a.cancel_at_period_end&&!['pending','canceled','incomplete_expired'].includes(a.status)){
        const cancel=button('Stop future subscription payments',async()=>{
          if(!window.confirm('Stop future subscription billing at the current period end? Contact KiwiKind separately to confirm broadband cancellation and any contractual obligations.'))return;
          cancel.disabled=true;
          try{const reply=await api('payments/cancel',{agreement_id:a.id,accept_live_cancel:true},generation);if(generation!==accountGeneration)return;notice(reply.message);await refreshLivePayments(generation);}finally{if(generation===accountGeneration)cancel.disabled=false;}
        });card.append(cancel);
      }
      for(const invoice of a.invoices||[])card.append(node('p',`Invoice: ${liveMoney(invoice.amount_cents)} · ${invoice.status} · refunded ${liveMoney(invoice.refunded_cents)}${invoice.dispute_status?' · dispute '+invoice.dispute_status:''}`));
      target.append(card);
    }
    if(!result.live_payments_enabled)target.prepend(node('p','New payments are currently paused. Existing payment records remain available.'));
  }catch(error){if(generation===accountGeneration)target.replaceChildren(node('p',error.message));}
}
