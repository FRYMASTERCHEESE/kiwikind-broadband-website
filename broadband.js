'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(n/100);
  const el = (tag,text,cls) => {const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;};
  let catalogue, selected, currentQuote, csrf='', account=null, generation=0, submitting=false;
  let submissionKey=crypto.randomUUID();
  const notice=(text,error=false)=>{$('notice').textContent=text;$('notice').classList.toggle('error',error);};
  async function api(path,data) {
    let response;
    try {response=await fetch('https://kiwikind-backend.onrender.com/api/'+path,{
      method:data===undefined?'GET':'POST',credentials:'include',cache:'no-store',redirect:'error',
      signal:AbortSignal.timeout(75000),headers:{'Content-Type':'application/json','X-CSRFToken':csrf},
      ...(data===undefined?{}:{body:JSON.stringify(data)})});}
    catch {throw Error(data===undefined?'Could not connect to KiwiKind. Reload to try again.':'The response was interrupted. Check My KiwiKind for your order before submitting again.');}
    const result=await response.json();
    if(!response.ok){const error=Error(result.error||'Request unavailable.');error.status=response.status;throw error;}
    if(result.csrfToken)csrf=result.csrfToken;
    return result;
  }
  function selection() {return selected.groups.map((_,i)=>$('option-'+i).value);}
  function linkSelection() {
    const params=new URLSearchParams({plan:selected.id,options:selection().join(',')});
    history.replaceState(null,'','?'+params);
    $('signin').href='./account.html?'+params+'#signin';
  }
  function renderQuote(q) {
    currentQuote=q;
    const list=$('breakdown');list.replaceChildren(el('strong',q.name));
    for(const option of q.options)list.append(el('p',option.group+': '+option.name,'fine'));
    $('monthly').textContent=money(q.monthly_cents);
    $('setup').textContent=q.setup_cents===null?'To confirm':money(q.setup_cents);
    $('due').textContent=q.first_invoice_cents===null?'To confirm':money(q.first_invoice_cents);
    $('usage').textContent=q.usage.join(' ') + (q.quote_complete?'':' Setup fees need confirmation before payment.');
    $('submit-order').disabled=!account || submitting;
    $('order-plan').disabled=false;
  }
  async function refreshQuote() {
    const sequence=++generation;currentQuote=null;
    $('submit-order').disabled=true;$('order-plan').disabled=true;
    linkSelection();
    try {
      const q=await api('broadband/quote?'+new URLSearchParams({product:selected.id,options:selection().join(',')}));
      if(sequence!==generation)return;
      renderQuote(q);notice('Prices include GST. Submit your order first; pay after connection confirmation.');
    }catch(error){if(sequence===generation)notice(error.message,true);}
  }
  function configure(product, initial) {
    if(submitting)return;
    selected=product;$('catalogue').hidden=true;$('configure').hidden=false;
    $('service-name').textContent=product.name;$('service-desc').textContent=product.description;
    $('fields').replaceChildren();$('order-result').textContent='';
    product.groups.forEach((group,index)=>{
      const label=el('h2',group.label,'label');label.id='group-'+index;
      const block=el('div','','field'), select=document.createElement('select');
      select.id='option-'+index;select.setAttribute('aria-labelledby',label.id);
      for(const option of group.options){const o=el('option',option.name);o.value=option.id;select.append(o);}
      if(initial&&group.options.some(o=>o.id===initial[index]))select.value=initial[index];
      select.addEventListener('change',()=>{submissionKey=crypto.randomUUID();void refreshQuote();});
      block.append(select);$('fields').append(label,block);
    });
    $('signin-required').hidden=!!account;$('order-form').hidden=!account;
    void refreshQuote();window.scrollTo(0,0);
  }
  function showCatalogue() {
    generation++;currentQuote=null;selected=null;$('catalogue').hidden=false;$('configure').hidden=true;
    history.replaceState(null,'',location.pathname);window.scrollTo(0,0);
  }
  $('back').addEventListener('click',()=>{if(!submitting)showCatalogue();});
  $('order-plan').addEventListener('click',()=>{$('order-area').scrollIntoView({behavior:'smooth',block:'start'});});
  $('order-form').addEventListener('input',()=>{if(!submitting)submissionKey=crypto.randomUUID();});
  $('order-form').addEventListener('submit',async event=>{
    event.preventDefault();if(submitting||!currentQuote||!account)return;
    const values=Object.fromEntries(new FormData(event.target));
    submitting=true;$('order-inputs').disabled=true;$('back').disabled=true;
    for(const input of $('fields').querySelectorAll('select'))input.disabled=true;
    $('order-result').textContent='Sending your order securely…';
    try {
      const result=await api('broadband/orders',{...values,product_id:currentQuote.product_id,selections:currentQuote.selections,
        quote_version:currentQuote.quote_version,consent_version:catalogue.consent_version,accept_review:values.accept_review==='on',idempotency_key:submissionKey});
      $('order-result').textContent=result.message+' Order reference: '+result.id;
      $('submit-order').textContent='Order received';notice('Order received. You have not been charged.');
    }catch(error){
      $('order-result').textContent=error.message;notice(error.message,true);
      // A missing/5xx response may follow a successful write. Preserve the key and
      // locked inputs, and direct the customer to account history before retrying.
      if(error.status>=400&&error.status<500){submitting=false;$('order-inputs').disabled=false;$('back').disabled=false;for(const input of $('fields').querySelectorAll('select'))input.disabled=false;}
    }
  });
  async function start(){
    try {
      catalogue=await api('broadband/catalogue');
      if(!catalogue.products?.length){notice('Broadband plans are temporarily unavailable. Please contact KiwiKind.');return;}
      for(const product of catalogue.products){
        const card=el('article','','card');card.append(el('h2',product.name),el('div','Starting from','from'),
          el('div',money(product.headline_monthly_cents),'price'),el('div','Monthly · incl. GST','period'),
          el('p',product.description,'desc'));
        if(product.headline_note)card.append(el('small',product.headline_note));
        const choose=el('button','Choose options','cta');choose.type='button';choose.onclick=()=>configure(product);
        card.append(choose);$('cards').append(card);
      }
      try {const state=await api('bootstrap');account=state.account||null;}catch {account=null;}
      notice('Choose a plan. Pay only after your address and connection details are confirmed.');
      const params=new URLSearchParams(location.search),product=catalogue.products.find(p=>p.id===params.get('plan'));
      if(product)configure(product,(params.get('options')||'').split(','));
    }catch(error){notice(error.message,true);}
  }
  void start();
})();
