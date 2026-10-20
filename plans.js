'use strict';
(async () => {
  const target = document.getElementById('public-plans');
  try {
    const response = await fetch('https://kiwikind-backend.onrender.com/api/plans', {credentials:'omit', cache:'no-store', signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Unavailable');
    const {plans} = await response.json();
    if (!Array.isArray(plans)) throw new Error('Invalid catalogue');
    if (!plans.length) return;
    target.replaceChildren();
    const money = value => new Intl.NumberFormat('en-NZ', {style:'currency',currency:'NZD'}).format(value/100);
    for (const plan of plans) {
      const card = document.createElement('article'); card.className='card';
      const title = document.createElement('h3'); title.textContent=plan.name;
      const price = document.createElement('p'); price.textContent=`${money(plan.retail_monthly_cents)}/month · ${money(plan.retail_setup_cents)} setup incl GST`;
      const detail = document.createElement('p'); detail.textContent=`${plan.download_mbps}/${plan.upload_mbps} Mbps · ${plan.network} · valid to ${plan.valid_until}. Address availability unverified.`;
      card.append(title,price,detail); target.append(card);
    }
  } catch { target.textContent='Plans are temporarily unavailable. No prices or address availability are confirmed.'; }
})();
