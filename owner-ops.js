'use strict';
window.KiwiKindOwnerOps={create({api,action,node,message}){
  const $=id=>document.getElementById(id);let generation=0,loaded=false;
  function clear(){generation++;loaded=false;$('ops-nav').replaceChildren();$('ops-content').replaceChildren();$('operations').hidden=true;}
  function button(label,fn){const b=node('button',label);b.type='button';b.addEventListener('click',action(fn));return b;}
  async function load(){
    if(loaded)return;const current=generation;const result=await api('owner/operations');if(current!==generation)return;
    $('ops-nav').replaceChildren();
    if(result.collections.some(item=>item.name==='requests')){
      const quick=button('Start here: review broadband requests',()=>collection('requests'));
      quick.classList.add('priority-requests');
      $('ops-nav').append(quick);
    }
    const advanced=node('details',''),summary=node('summary','Advanced test records (owner only)');
    advanced.append(summary);
    for(const item of result.collections){
      if(item.name.startsWith('test-'))advanced.append(button(item.label,()=>collection(item.name)));
      else $('ops-nav').append(button(item.label,()=>collection(item.name)));
    }
    if(advanced.children.length>1)$('ops-nav').append(advanced);
    loaded=true;$('operations').hidden=false;
  }
  async function collection(kind,page=1,q='',customer=''){
    const current=++generation;
    const query=new URLSearchParams({page,q,...(customer?{customer}:{})});
    const data=await api('owner/operations/'+kind+'?'+query);if(current!==generation)return;
    const host=$('ops-content');host.replaceChildren(node('h3',kind==='requests'?'Broadband requests':kind.replaceAll('-',' ')));
    if(kind==='requests'){
      const help=node('p','Select a request to review its chosen plan and service address. No charge or Vetta order is placed from this list.');
      help.className='owner-order-hint';host.append(help);
      const first=data.rows.find(record=>record.status==='requested'||record.status==='reviewing');
      if(first){const next=button('Review next broadband request',()=>detail(kind,first.id));next.classList.add('owner-action-primary');host.append(next);}
    }
    const search=node('form',''),input=document.createElement('input');input.type='search';input.placeholder='Search';input.setAttribute('aria-label','Search '+kind);input.value=q;search.append(input,node('button','Search'));
    search.addEventListener('submit',action(()=>collection(kind,1,input.value,customer)));host.append(search);
    if(data.create)host.append(button('Add private record',()=>detail(kind,'new')));
    const scroll=node('div','');scroll.className='table-scroll';const table=node('table',''),thead=node('thead',''),tr=node('tr','');
    for(const column of data.columns)tr.append(node('th',column.replaceAll('_',' ')));tr.append(node('th','Review'));thead.append(tr);table.append(thead);
    const tbody=node('tbody','');for(const item of data.rows){const row=node('tr','');for(const column of data.columns)row.append(node('td',item[column]===null?'Unknown':String(item[column])));const cell=node('td','');cell.append(button(kind==='requests'?'Review request':'Open',()=>detail(kind,item.id)));row.append(cell);tbody.append(row);}table.append(tbody);scroll.append(table);host.append(scroll);
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
    if(data.kind==='payment-agreements'&&data.editable){
      const preview=node('p','');preview.setAttribute('role','status');form.append(preview);
      const update=()=>{
        const a=form.elements.source_monthly_cents.value,b=form.elements.source_setup_cents.value;
        const valid=[a,b].every(v=>/^\d+$/.test(v)&&Number(v)<=1000000);
        const approval=form.elements.confirm_live_offer;
        if(approval){approval.checked=false;approval.disabled=!valid;}
        if(!valid){preview.textContent='Enter both confirmed supplier amounts in cents to preview the final customer totals. Unknown setup cannot be approved.';return;}
        const monthly=Math.round(Number(a)*115/100)+300,setup=Math.round(Number(b)*115/100)+1000;
        const money=n=>new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(n/100);
        preview.textContent=`Customer offer: ${money(monthly)} per month plus ${money(setup)} setup once. First payment ${money(monthly+setup)}. GST included. The displayed monthly and one-time setup charges are final GST-inclusive customer totals.`;
      };
      form.addEventListener('input',event=>{if(event.target.name!=='confirm_live_offer')update();});update();
    }
    if(data.kind==='payment-agreements'&&data.editable){
      const attestation=node('label','I personally verified this customer’s address, service availability and final supplier fees in Vetta. I understand this approves a customer offer, not an automatic supplier order.');
      attestation.className='owner-approval-attestation';
      const verified=document.createElement('input');verified.type='checkbox';verified.name='vetta_owner_verified';attestation.prepend(verified);form.append(attestation);
      const approvalButton=node('button','Save draft for later');approvalButton.type='submit';approvalButton.className='owner-action-primary';form.append(approvalButton);
      const updateApproval=()=>{
        const approving=form.elements.reviewed?.checked===true;
        approvalButton.textContent=approving?'Approve final customer offer':'Save draft for later';
        verified.required=approving;
        approvalButton.disabled=approving&&!verified.checked;
        approvalButton.setAttribute('aria-describedby','owner-approval-steps');
      };
      form.addEventListener('change',updateApproval);verified.addEventListener('change',updateApproval);updateApproval();
    }else if(data.editable)form.append(node('button','Save private record'));
    return form;
  }
  async function detail(kind,id){
    const current=++generation;const data=await api('owner/operations/'+kind+'/'+id);if(current!==generation)return;
    const host=$('ops-content');host.replaceChildren(button('Back to records',()=>collection(kind)),node('h3',kind.replaceAll('-',' ')+' · '+id));
    if(kind==='payment-agreements'){
      const intro=node('section','');intro.className='owner-approval-guide';
      intro.append(node('h4','Confirm the final offer in one place'));
      const list=node('ol','');
      for(const step of ['Check this customer’s address and supplier availability in Vetta.',
       'Enter exact supplier costs in cents. Confirm all installation, equipment, cancellation and payment-start terms.',
       'Review the GST-inclusive customer total, tick Supplier confirmed, Reviewed and the exact-offer checkbox, then save.']){
          list.append(node('li',step));
      }
      intro.id='owner-approval-steps';
      intro.append(list,node('p','Saving an approved offer does not charge the customer or submit a Vetta order. The customer must separately accept the payment.'));
      host.append(intro);
    }
    for(const [key,value] of Object.entries(data.record))host.append(node('p',key.replaceAll('_',' ')+': '+(value??'Unknown')));
    if(data.broadband){
      const q=data.broadband,money=n=>new Intl.NumberFormat('en-NZ',{style:'currency',currency:'NZD'}).format(n/100);
      host.append(node('h4','Customer broadband selection'),node('p',q.name));
      for(const o of q.options)host.append(node('p',o.group+': '+o.name));
      host.append(node('p',money(q.monthly_cents)+'/month · '+(q.setup_cents===null?'Setup to confirm':money(q.setup_cents)+' setup once')+' · GST included'));
      for(const usage of q.usage)host.append(node('p',usage));
      const review=node('section','');review.className='owner-approval-guide';
      review.append(node('h4','Review this connection in three steps'));
      const steps=node('ol','');
      for(const step of ['Confirm this address, service and installation details in your Vetta portal.',
         'Check the selected plan and final supplier costs, including any unknown setup fees.',
         'Prepare and approve a written payment offer. The customer pays only after accepting it.']){
            steps.append(node('li',step));
      }
      review.append(steps,node('p','No automatic Vetta order or Stripe charge happens here.'));
      host.append(review);
      if(data.payment_agreement_id){const c=button('Continue: review and approve final offer',()=>detail('payment-agreements',data.payment_agreement_id));c.classList.add('owner-action-primary');host.append(c);}
      else if(data.record.status!=='cancelled'){const c=button('Continue: prepare the customer offer',async()=>{
        const result=await api('owner/broadband-orders/'+id+'/prepare-offer',{});
        await detail('payment-agreements',result.agreement_id);message(result.message||'Draft offer prepared.');
      });c.classList.add('owner-action-primary');host.append(c);}
    }
    if(data.checklist)host.append(node('p',data.checklist));
    const form=fieldsForm(data);
    form.addEventListener('submit',action(async()=>{
      const values={};for(const field of data.fields){if(field.disabled)continue;const input=form.elements[field.name];values[field.name]=field.type==='checkbox'?input.checked:input.value;}
      try{
        if(kind==='payment-agreements'&&values.reviewed===true&&!form.elements.vetta_owner_verified?.checked)throw Error('Verify this customer’s address and supplier details in Vetta before approving.');
        const saved=await api('owner/operations/'+kind+'/'+id,{version:data.version,values,confirm_completed:form.elements.confirm_completed?.checked===true});
        await detail(kind,saved.id);
        message(kind==='payment-agreements'&&saved.record?.reviewed===true?'Final customer offer approved. The customer may review and accept it when their payment-start date arrives; no charge or supplier order was created.':saved.message);
      }
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
