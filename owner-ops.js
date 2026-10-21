'use strict';
window.KiwiKindOwnerOps={create({api,action,node,message}){
  const $=id=>document.getElementById(id);let generation=0,loaded=false;
  function clear(){generation++;loaded=false;$('ops-nav').replaceChildren();$('ops-content').replaceChildren();$('operations').hidden=true;}
  function button(label,fn){const b=node('button',label);b.type='button';b.addEventListener('click',action(fn));return b;}
  async function load(){
    if(loaded)return;const current=generation;const result=await api('owner/operations');if(current!==generation)return;
    $('ops-nav').replaceChildren();for(const item of result.collections)$('ops-nav').append(button(item.label,()=>collection(item.name)));
    loaded=true;$('operations').hidden=false;
  }
  async function collection(kind,page=1,q='',customer=''){
    const current=++generation;
    const query=new URLSearchParams({page,q,...(customer?{customer}:{})});
    const data=await api('owner/operations/'+kind+'?'+query);if(current!==generation)return;
    const host=$('ops-content');host.replaceChildren(node('h3',kind.replaceAll('-',' ')));
    const search=node('form',''),input=document.createElement('input');input.type='search';input.placeholder='Search';input.setAttribute('aria-label','Search '+kind);input.value=q;search.append(input,node('button','Search'));
    search.addEventListener('submit',action(()=>collection(kind,1,input.value,customer)));host.append(search);
    if(data.create)host.append(button('Add private record',()=>detail(kind,'new')));
    const scroll=node('div','');scroll.className='table-scroll';const table=node('table',''),thead=node('thead',''),tr=node('tr','');
    for(const column of data.columns)tr.append(node('th',column.replaceAll('_',' ')));tr.append(node('th','Review'));thead.append(tr);table.append(thead);
    const tbody=node('tbody','');for(const item of data.rows){const row=node('tr','');for(const column of data.columns)row.append(node('td',item[column]===null?'Unknown':String(item[column])));const cell=node('td','');cell.append(button('Open',()=>detail(kind,item.id)));row.append(cell);tbody.append(row);}table.append(tbody);scroll.append(table);host.append(scroll);
    host.append(node('p',`Page ${data.page} · ${data.total} records`));
    if(page>1)host.append(button('Previous',()=>collection(kind,page-1,q,customer)));
    if(page*30<data.total)host.append(button('Next',()=>collection(kind,page+1,q,customer)));
  }
  function fieldsForm(data){
    const form=node('form','');form.id='ops-edit-form';
    for(const field of data.fields){
      const label=node('label',field.label);let input;
      if(field.choices){input=document.createElement('select');for(const [value,title] of field.choices){const option=node('option',title);option.value=value;input.append(option);}}
      else input=document.createElement(field.type==='textarea'?'textarea':'input');
      if(input.tagName==='INPUT')input.type=field.type==='checkbox'?'checkbox':'text';
      input.name=field.name;input.disabled=field.disabled||!data.editable;
      if(field.type==='checkbox')input.checked=field.value===true;else input.value=field.value??'';
      if(field.max_length)input.maxLength=field.max_length;
      input.required=field.required&&!input.disabled;
      label.append(input);if(field.help)label.append(node('small',field.help));
      if(field.name==='expected_updated_at')label.hidden=true;
      form.append(label);
    }
    if(data.kind==='privacy'&&data.editable){const label=node('label','I confirm any requested manual fulfilment and lawful retention review are complete. This records review status; it does not delete customer data.');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='confirm_completed';label.prepend(checkbox);form.append(label);}
    if(data.editable)form.append(node('button','Save private record'));
    return form;
  }
  async function detail(kind,id){
    const current=++generation;const data=await api('owner/operations/'+kind+'/'+id);if(current!==generation)return;
    const host=$('ops-content');host.replaceChildren(button('Back to records',()=>collection(kind)),node('h3',kind.replaceAll('-',' ')+' · '+id));
    for(const [key,value] of Object.entries(data.record))host.append(node('p',key.replaceAll('_',' ')+': '+(value??'Unknown')));
    if(data.checklist)host.append(node('p',data.checklist));
    const form=fieldsForm(data);
    form.addEventListener('submit',action(async()=>{
      const values={};for(const field of data.fields){if(field.disabled)continue;const input=form.elements[field.name];values[field.name]=field.type==='checkbox'?input.checked:input.value;}
      try{const saved=await api('owner/operations/'+kind+'/'+id,{version:data.version,values,confirm_completed:form.elements.confirm_completed?.checked===true});await detail(kind,saved.id);message(saved.message);}
      catch(error){message(error.message);}
    }));host.append(form);
    if(kind==='customers'){const links=node('div','');links.className='actions';for(const type of ['requests','tickets','privacy','invoices'])links.append(button('View '+type,()=>collection(type,1,'',id)));host.append(links);}
    if(data.messages){host.append(node('h4','Conversation'));
      for(const item of data.messages)host.append(node('small',`${item.created_at} · author ${item.author_id}`),node('p',item.body));
      const reply=node('form',''),label=node('label','Reply to customer'),body=document.createElement('textarea');body.name='body';body.required=true;body.maxLength=4000;label.append(body);reply.append(label,node('button','Record support reply'));let submission=crypto.randomUUID();
      body.addEventListener('input',()=>{submission=crypto.randomUUID();});
      reply.addEventListener('submit',action(async()=>{const result=await api('owner/tickets/'+id+'/reply',{body:body.value,submission_key:submission});await detail(kind,id);message(result.message);}));host.append(reply);
    }
    if(data.transitions?.length){host.append(node('h4',data.record.rehearsal?'Practice processing':'Preparation only — live supplier processing disabled'));
      const transition=node('form',''),select=document.createElement('select');select.setAttribute('aria-label','Next preparation status');for(const value of data.transitions){const option=node('option',value);option.value=value;select.append(option);}const note=document.createElement('textarea');note.required=true;note.maxLength=2000;note.placeholder='Private processing note';note.setAttribute('aria-label','Private processing note');const reference=document.createElement('input');reference.maxLength=160;reference.placeholder='Reference (if required)';reference.setAttribute('aria-label','Processing reference');transition.append(select,note,reference,node('button','Record preparation update'));let key=crypto.randomUUID();
      transition.addEventListener('submit',action(async()=>{const result=await api('owner/cases/'+kind+'/'+id+'/transition',{target:select.value,revision:data.revision,submission_key:key,note:note.value,reference:reference.value});await detail(kind,id);message(result.message);}));host.append(transition);
    }
    for(const event of data.history||[])host.append(node('p',`${event.created_at} · ${event.from_state} → ${event.to_state}: ${event.note}`));
    if(kind==='test-invoices'&&data.record.status==='paid'&&data.record.refunded_cents===0&&!data.record.dispute_status){
      const refund=node('form',''),label=node('label',`I request a full TEST refund of NZD ${(data.record.amount_cents/100).toFixed(2)}. No real money or broadband service is involved.`),check=document.createElement('input');check.type='checkbox';check.required=true;label.prepend(check);refund.append(label,node('button','Request full TEST refund'));
      refund.addEventListener('submit',action(async()=>{const result=await api('billing/refund',{invoice_id:id,accept_test_refund:check.checked});await detail(kind,id);message(result.message);}));host.append(refund);
    }
    if(kind==='test-agreements'&&data.record.reviewed){
      const billing=node('form',''),label=node('label',`I authorise this TEST agreement only: NZD ${(data.record.monthly_cents/100).toFixed(2)}/month and NZD ${(data.record.setup_cents/100).toFixed(2)} setup. No real money or broadband.`),check=document.createElement('input');check.type='checkbox';check.required=true;label.prepend(check);billing.append(label,node('button',data.record.status==='pending'?'Open TEST Checkout':'Cancel TEST subscription at period end'));
      billing.addEventListener('submit',action(async()=>{
        if(data.record.status==='pending'){
          const result=await api('billing/checkout',{agreement_id:id,terms_version:data.record.terms_version,accept_test_recurring:check.checked});
          const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||!url.pathname.startsWith('/c/pay/cs_test_')||url.username||url.password)throw Error('Invalid test Checkout URL');
          const link=node('a','Continue to Stripe TEST Checkout');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';billing.append(link);
        }else{const result=await api('billing/cancel',{agreement_id:id,accept_test_cancel:check.checked});await detail(kind,id);message(result.message);}
      }));if(!data.record.cancel_at_period_end&&data.record.status!=='canceled')host.append(billing);
    }
  }
  return {load,clear};
}};
