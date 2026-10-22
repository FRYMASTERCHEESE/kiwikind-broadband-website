'use strict';
(async () => {
  const target = document.getElementById('public-plans');
  try {
    const response = await fetch('https://kiwikind-backend.onrender.com/api/broadband/catalogue', {credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(75000)});
    if (!response.ok) throw new Error('Unavailable');
    const {products:plans} = await response.json();
    if (!Array.isArray(plans)) throw new Error('Invalid catalogue');
    if (!plans.length) return;
    target.replaceChildren();
    const money = value => new Intl.NumberFormat('en-NZ', {style:'currency',currency:'NZD'}).format(value/100);
    for (const plan of plans) {
      const card = document.createElement('article'); card.className='card';
      const title = document.createElement('h3'); title.textContent=plan.name;
      const price = document.createElement('p'); price.textContent=`From ${money(plan.headline_monthly_cents)}/month including GST${plan.headline_note?' · '+plan.headline_note:''}`;
      const link=document.createElement('a');link.className='cta';link.textContent='Choose options';link.href='./broadband.html?'+new URLSearchParams({plan:plan.id});
      card.append(title,price,link); target.append(card);
    }
  } catch { /* Keep the static catalogue link visible while the service wakes. */ }
})();
