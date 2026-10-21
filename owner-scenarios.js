'use strict';
window.KiwiKindSandbox={create({api,action,node,message}){
  const host=document.getElementById('sandbox-exercises');let epoch=0,loaded=false,submission=crypto.randomUUID();
  const button=(title,fn)=>{const b=node('button',title);b.type='button';b.addEventListener('click',action(fn));return b;};
  const clear=()=>{epoch++;loaded=false;host.replaceChildren();};
  async function load(force=false){
    if(loaded&&!force)return;
    const current=++epoch;const data=await api('owner/sandbox-runs');if(current!==epoch)return;
    host.replaceChildren(node('h2','Stripe sandbox exercises'),node('p','Synthetic TEST customers only. Each exercise is NZ$1/month in Stripe test mode. Nothing enables live payments, public prices or broadband orders.'));
    const form=node('form',''),select=document.createElement('select');select.setAttribute('aria-label','Sandbox scenario');for(const [value,title] of [['renewal','Paid subscription renewal'],['decline-3ds','Declined card and 3D Secure challenge']]){const option=node('option',title);option.value=value;select.append(option);}const label=node('label','I authorise this synthetic recurring NZ$1/month TEST exercise only.'),check=document.createElement('input');check.type='checkbox';check.required=true;label.prepend(check);form.append(select,label,node('button','Prepare TEST exercise'));
    select.addEventListener('change',()=>{submission=crypto.randomUUID();});
    form.addEventListener('submit',action(async()=>{await api('owner/sandbox-runs',{scenario:select.value,submission_key:submission,confirm_test_only:check.checked});submission=crypto.randomUUID();await load(true);}));host.append(form);
    host.append(button('Refresh TEST exercises',()=>load(true)));
    for(const run of data.runs){
      const block=node('div','');block.className='evidence';block.append(node('h3',run.scenario+' · '+run.id),node('p','TEST status: '+run.status));
      block.append(node('p',run.scenario==='renewal'?'Use Stripe’s standard successful TEST card for initial Checkout, then advance this clock.':'In TEST Checkout, try the declined test card first, then the 3D Secure-required test card and complete the simulated challenge. Never enter a real card.'));
      if(run.status==='pending')block.append(button('Prepare Stripe TEST Checkout',async()=>{
        const result=await api('billing/checkout',{agreement_id:run.agreement_id,terms_version:run.terms_version,accept_test_recurring:true});
        const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||!url.pathname.startsWith('/c/pay/cs_test_')||url.username||url.password)throw Error('Invalid Stripe TEST URL');
        const link=node('a','Open Stripe TEST Checkout');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';block.append(link);
      }));
      if(run.scenario==='renewal'&&run.status!=='pending')block.append(button('Advance this TEST clock through renewal',async()=>{message((await api('owner/sandbox-runs/'+run.id+'/advance',{confirm_advance:true})).message);}));
      const result=node('p','');result.setAttribute('role','status');
      block.append(button('Verify current TEST scenario evidence',async()=>{const generation=epoch;const data=await api('owner/sandbox-runs/'+run.id+'/evidence',{});if(generation!==epoch)return;result.textContent=Object.entries(data.flags).map(([key,value])=>key.replaceAll('_',' ')+': '+(value?'confirmed':'outstanding')).join(' · ');}),result);
      if(run.status!=='pending'&&!run.cancel_at_period_end&&run.status!=='canceled')block.append(button('Cancel this TEST subscription at period end',async()=>{message((await api('billing/cancel',{agreement_id:run.agreement_id,accept_test_cancel:true})).message);await load(true);}));
      host.append(block);
    }
    loaded=true;
  }
  return {load,clear};
}};
