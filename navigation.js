/* Navigation only: no credentials, customer data, supplier or payment calls. */
(() => {
  'use strict';
  const path = location.pathname.split('/').pop() || 'index.html';
  const hrefs = [
    ['Browse plans', './broadband.html'],
    ['My orders', './account.html#portal'],
    ['Payment offers', './account.html#portal'],
    ['Support', './account.html#portal'],
  ];
  const bar = document.createElement('nav');
  bar.className = 'kk-shortcuts';
  bar.setAttribute('aria-label', 'Quick customer navigation');
  for (const [label, href] of hrefs) {
    const link=document.createElement('a');
    link.textContent=label;link.href=href;
    if((path==='broadband.html'&&label==='Browse plans')||
       (path==='account.html'&&label==='My orders'))link.setAttribute('aria-current','page');
    bar.append(link);
  }
  const header=document.querySelector('header');
  if(header)header.insertAdjacentElement('afterend',bar);

  if(path==='broadband.html'){
    const section=document.getElementById('catalogue');
    const cards=document.getElementById('cards');
    if(section&&cards){
      const guide=document.createElement('ol');
      guide.className='kk-steps';
      guide.setAttribute('aria-label','Four steps to broadband');
      for(const [heading,description] of [
        ['1. Choose','Browse a plan'],
        ['2. Configure','Pick speed and extras'],
        ['3. Request','Send your address'],
        ['4. Pay later','After owner approval'],
      ]){
        const item=document.createElement('li');
        const strong=document.createElement('strong');strong.textContent=heading;
        const small=document.createElement('span');small.textContent=description;
        item.append(strong,small);guide.append(item);
      }
      section.insertBefore(guide,cards);
      const searchWrap=document.createElement('div');
      searchWrap.className='kk-plan-filter';
      const label=document.createElement('label');label.htmlFor='kk-search';label.textContent='Find a broadband type';
      const input=document.createElement('input');input.id='kk-search';input.type='search';
      input.placeholder='Fibre, rural, wireless, mobile…';input.autocomplete='off';
      const result=document.createElement('p');result.id='kk-filter-status';
      result.setAttribute('role','status');result.setAttribute('aria-live','polite');
      const empty=document.createElement('p');empty.id='kk-empty';empty.hidden=true;
      empty.textContent='No matching broadband types. Clear the search to view all plans.';
      searchWrap.append(label,input,result,empty);
      section.insertBefore(searchWrap,cards);
      function filter(){
        const term=input.value.trim().toLocaleLowerCase('en-NZ');
        let count=0;
        for(const card of cards.querySelectorAll('.card')){
          const match=card.textContent.toLocaleLowerCase('en-NZ').includes(term);
          card.hidden=!match;if(match)count++;
        }
        result.textContent=count+' broadband '+(count===1?'type':'types')+' shown';
        empty.hidden=count!==0;
      }
      input.addEventListener('input',filter);
      new MutationObserver(filter).observe(cards,{childList:true});
      filter();
    }
    const config=document.getElementById('configure');
    if(config){
      const explainer=document.createElement('p');explainer.className='kk-config-guide';
      explainer.textContent='Step 2 of 4: configure your plan. Your exact monthly and once-only setup totals include GST. Submit an address request first; do not pay until confirmed.';
      config.insertBefore(explainer,config.querySelector('.config-layout'));
    }
    const result=document.getElementById('order-result');
    if(result){
      const track=document.createElement('a');track.className='kk-track-order';
      track.href='./account.html#portal';
      track.textContent='Track my request and payment offer →';
      track.hidden=true;result.insertAdjacentElement('afterend',track);
      new MutationObserver(()=>{
        // The response contains the server's order reference only on success.
        track.hidden=!/Order received for an address and connection check/.test(result.textContent);
      }).observe(result,{childList:true,characterData:true,subtree:true});
    }
  }

  if(path==='owner.html'){
    const ops=document.getElementById('operations');
    if(ops){
      const guide=document.createElement('p');guide.className='kk-owner-guide';
      guide.textContent='New broadband requests: select Requests below, confirm availability in your Vetta portal, prepare the final payment offer and approve it. No Vetta order is placed automatically.';
      ops.insertBefore(guide,ops.querySelector('#ops-nav'));
    }
  }
})();
