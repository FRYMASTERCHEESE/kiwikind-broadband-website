'use strict';
window.KiwiKindCatalogueReview={create({api,action,node}){
  const list=document.getElementById('release-list');
  const detail=document.getElementById('release-detail');
  let epoch=0;
  const money=value=>value===null||value===undefined?'Not confirmed':`NZ$${Number(value).toFixed(2)}`;
  const cents=value=>value===null||value===undefined?'Not confirmed':money(value/100);
  const button=(text,fn)=>{const b=node('button',text);b.type='button';b.addEventListener('click',action(fn));return b;};
  const clear=()=>{epoch++;list.replaceChildren();detail.replaceChildren();};
  async function open(id){
    const generation=++epoch;detail.replaceChildren(node('p','Loading private plan prices…'));
    const data=await api('owner/catalogue-releases/'+id);
    if(generation!==epoch||document.hidden)return;
    const header=node('div','');
    header.append(node('h3',`${data.release.products} plans · ${data.release.active?'Live release':'Private draft'}`),
      node('p','Review only. These controls cannot approve plans, publish prices, take payment or order a service.'),
      node('p','Release fingerprint: '+data.release.checksum));
    const filter=document.createElement('input');filter.type='search';filter.placeholder='Find a network, plan or speed';filter.setAttribute('aria-label','Find a private plan');
    const rows=node('div','');
    function render(){
      rows.replaceChildren();const term=filter.value.toLowerCase();
      for(const product of data.products){
        const p=product.source,q=product.retail_preview;
        if(!(p.name+' '+p.family).toLowerCase().includes(term))continue;
        const card=node('section','');card.className='evidence';
        card.append(node('h4',p.name),node('p',p.description),
          node('p','Source: '+p.source_ref),
          node('p',`Supplier recurring base, excluding GST: ${money(p.base)}. Speed-specific/base setup component: ${money(p.baseSetup)}. ${p.setupUnknown?'Complete setup is not confirmed.':''}`),
          node('p','Data and usage: '+p.allowance),node('p',p.terms),
          node('p',`Default retail preview, including GST: ${cents(q.monthly_cents)}/month; setup ${cents(q.setup_cents)}; first payment ${cents(q.first_invoice_cents)}.`),
          node('p','Default choices: '+product.default_selections.map(o=>o.group+': '+o.option).join('; ')));
        if(p.unverified.length)card.append(node('p','Still to confirm: '+p.unverified.join('; ')));
        for(const group of p.groups){
          const options=node('details','');options.append(node('summary',group.label+' — supplier components excluding GST'));
          const choices=node('ul','');
          for(const option of group.options){
            choices.append(node('li',option.name+': '+(option.unknown?'Price not confirmed':`${money(option.monthly)}/month; ${money(option.setup)} setup`)+(option.usage?`; usage ${money(option.usage.rate)}/${option.usage.unit}`:'')));
          }
          options.append(choices);card.append(options);
        }
        rows.append(card);
      }
    }
    filter.addEventListener('input',render);detail.replaceChildren(header,filter,rows);render();
  }
  async function load(){
    const generation=++epoch;const data=await api('owner/catalogue-releases');
    if(generation!==epoch||document.hidden)return;
    list.replaceChildren();detail.replaceChildren();
    for(const release of data.releases){
      const row=node('div','');row.className='evidence';
      row.append(node('strong',`${release.products} plans · ${release.active?'Live':release.approved?'Approved archive':'Private draft'}`),
        node('p',`Verified: ${release.verified_on||'Not confirmed'} · Review expires: ${release.valid_until||'Not confirmed'}`),
        button('Review these prices',()=>open(release.id)));
      list.append(row);
    }
    if(!data.releases.length)list.append(node('p','No catalogue releases saved.'));
  }
  return {load,clear};
}};
