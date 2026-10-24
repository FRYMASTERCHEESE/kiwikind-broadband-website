// Read-only QA. Browses the public page with no account or credentials.
// Never submits a broadband order, starts checkout or reads private supplier data.
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [390,1365]){
      const context=await browser.newContext({viewport:{width,height:860},serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',error=>errors.push(String(error.message).slice(0,300)));
      page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text().slice(0,300));});
      page.on('response',response=>{
        const url=new URL(response.url());
        if(url.hostname==='kiwikind-backend.onrender.com'&&
          ['/api/broadband/catalogue','/api/bootstrap'].includes(url.pathname)){
          requests.push({path:url.pathname,status:response.status(),
            allowedOrigin:response.headers()['access-control-allow-origin']||'',
            credentials:response.headers()['access-control-allow-credentials']||''});
        }
      });
      await page.goto('https://frymastercheese.github.io/kiwikind-broadband-website/broadband.html',
        {waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>{
        const notice=document.querySelector('#notice');
        return document.querySelectorAll('#cards article.card').length>0 ||
          (notice && (/temporarily unavailable|Could not connect|Request unavailable|Reload to try again/i).test(notice.textContent));
      },{timeout:100000}).catch(()=>{});
      const state=await page.evaluate(()=>({
        cards:document.querySelectorAll('#cards article.card').length,
        visibleCards:[...document.querySelectorAll('#cards article.card')].filter(e=>e.getClientRects().length>0).length,
        notice:document.querySelector('#notice')?.textContent?.slice(0,200)||'',
        title:document.title,
        cardsContainerPresent:!!document.getElementById('cards')
      }));
      console.log('PUBLIC BROADBAND MOBILE/DESKTOP CHECK',JSON.stringify({width,...state,requests,errors}));
      assert.ok(state.cards>0,`Zero public broadband plans rendered at width ${width}`);
      assert.equal(state.visibleCards,state.cards,'Plans exist but are hidden in the customer page');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error('READ_ONLY_PUBLIC_UI_CHECK_FAILED:',error.message);process.exitCode=1;});
