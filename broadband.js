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

  // Plain-language helper. Uses current server catalogue options; it never
  // guesses an address result, changes a supplier price or submits an order.
  const helpBySituation = {
    fibre: {
      title: 'Fibre box already in your home? Start with Fibre (UFB).',
      description: 'A fibre box (ONT) may support a fibre connection, but KiwiKind must confirm your address and the genuine supplier speeds before showing any options.',
      plans: [['Compare home fibre options', 'ufb']],
    },
    rural: {
      title: 'Country home? Check for fibre before choosing wireless.',
      description: 'Rural homes can have fibre too. If a fibre connection is present and can be supplied, fibre is a good first option. If fibre is unavailable, compare RBI Rural and Fixed Wireless; coverage, data allowances, equipment and installation must be checked for your address.',
      plans: [['Fibre if available', 'ufb'],
              ['See RBI Rural plans', 'rbi'],
              ['See Fixed Wireless plans', 'fixed-wireless']],
    },
    copper: {
      title: 'Phone-line broadband: compare VDSL or ADSL.',
      description: 'VDSL or ADSL may be available on an older copper phone line, but fibre is usually worth checking first. Copper availability varies and not every property can get a new copper service.',
      plans: [['See VDSL plans', 'vdsl'], ['See ADSL plans', 'adsl'],
              ['See Fibre instead', 'ufb']],
    },
    unsure: {
      title: "That's fine — check your address first.",
      description: 'An internet provider must check the exact property, not just the town or whether it is rural. Use the independent address map below as a starting point. KiwiKind still confirms the network, installation charges and equipment before payment.',
      plans: [['Browse normal home Fibre', 'ufb'],
              ['Browse Rural Broadband', 'rbi']],
    },
  };
  function openSuggestedPlan(productId){
    const product=catalogue?.products?.find(p=>p.id===productId||p.family===productId);
    if(!product){notice('This plan is not currently available to request. Please check again or contact KiwiKind.',true);return;}
    configure(product,null);
  }
  function chooseSituation(situation){
    const guide=helpBySituation[situation];
    if(!guide)return;
    for(const b of document.querySelectorAll('[data-situation]'))
      b.setAttribute('aria-pressed',String(b.dataset.situation===situation));
    $('finder-result-heading').textContent=guide.title;
    $('finder-result-description').textContent=guide.description;
    const actions=$('finder-actions');actions.replaceChildren();
    for(const [label,id] of guide.plans){
      const b=el('button',label,'finder-plan');
      b.type='button';
      b.addEventListener('click',()=>openSuggestedPlan(id));
      actions.append(b);
    }
    $('finder-result').hidden=false;
  }
  for(const b of document.querySelectorAll('[data-situation]')){
    b.addEventListener('click',()=>chooseSituation(b.dataset.situation));
  }
  const friendlyUse = {
    adsl: 'Older phone-line internet when fibre or wireless is not suitable.',
    vdsl: 'Often faster than ADSL on eligible phone lines. Ask us to check copper availability.',
    ufb: 'For homes with a fibre box (ONT), or properties where fibre can be installed.',
    vector: 'Special fibre network option for eligible Vector areas, mainly Auckland.',
    rbi: 'An option for rural addresses without suitable fibre, subject to coverage and data limits.',
    'fixed-wireless': 'Wireless home internet where there is suitable coverage and equipment.',
    'mobile-4g': 'Mobile-data internet for lighter use; check the data allowance and extra usage charges.',
  };
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
    $('usage').textContent=(q.usage||[]).join(' ') + ' This is an estimate only. Final installation, changeover, equipment and usage charges depend on your address and must be confirmed before payment.';
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
      renderQuote(q);notice(!['verified','verified_speed_address_review_required','screen_checked'].includes(q.price_status)?'Supplier rates still need checking. This is a request estimate, not an approved price; do not pay until we confirm all charges.':'Your estimated price includes GST. Installation and supply are confirmed before the final offer and payment.');
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
      if(!catalogue.products?.length){
        $('plan-finder').hidden=true;
        notice('We have cleared all previous broadband plans. KiwiKind is rebuilding its catalogue from Vetta. No prices, download speeds or upload speeds are listed for sale.');
        return;
      }
      for(const product of catalogue.products){
        const card=el('article','','card');card.append(el('h2',product.name),el('div','Starting from','from'),
          el('div',money(product.headline_monthly_cents),'price'),el('div','Monthly · incl. GST','period'),
          el('p',product.description,'desc'));
        if(friendlyUse[product.family||product.id])card.insertBefore(el('p',friendlyUse[product.family||product.id],'best-for'),card.querySelector('.desc'));
        card.append(el('p',!['verified','verified_speed_address_review_required','screen_checked'].includes(product.price_status)?'Supplier rate to be confirmed before payment.':'Rate checked; address and setup fees still need confirmation.','plan-price-status'));
        if(product.allowance)card.append(el('p',product.allowance,'allowance'));
        if(product.terms)card.append(el('p',product.terms,'fine'));
        if(product.default_quote){const q=product.default_quote;card.append(el('p',`Setup once: ${q.setup_cents===null?'To confirm':money(q.setup_cents)} · First payment: ${q.first_invoice_cents===null?'To confirm':money(q.first_invoice_cents)} including GST`,'fine'));}
        const choose=el('button','Choose options','cta');choose.type='button';choose.onclick=()=>configure(product,null);
        card.append(choose);$('cards').append(card);
      }
      try {const state=await api('bootstrap');account=state.account||null;}catch {account=null;}
      notice('Start with the simple plan guide. Prices are estimates and installation charges depend on the property; no payment is taken when you request an address check.');
      const params=new URLSearchParams(location.search),product=catalogue.products.find(p=>p.id===params.get('plan'));
      if(product)configure(product,(params.get('options')||'').split(','));
    }catch(error){notice(error.message,true);}
  }
  void start();
})();
