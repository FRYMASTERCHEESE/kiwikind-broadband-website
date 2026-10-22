// Synthetic customer and responses only; no real order or payment is submitted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'), fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const fixture=require('./broadband-fixture.json'),root=path.resolve(__dirname,'..');
const out=process.env.PAGES_SCREENSHOTS||'test-results/broadband';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
for(const width of [320,390,1365]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let signedIn=false,submitted=[],reject=false,holdQuote;
 await page.route('https://kiwikind-backend.onrender.com/api/**',async route=>{
  const req=route.request(),url=new URL(req.url());let data,status=200;
  if(url.pathname==='/api/broadband/catalogue')data=fixture.catalogue;
  else if(url.pathname==='/api/bootstrap')data={csrfToken:'synthetic',account:signedIn?{email:'synthetic@example.invalid'}:null};
  else if(url.pathname==='/api/broadband/quote'){
   if(url.searchParams.get('product')==='ufb'&&url.searchParams.get('options')==='1'){holdQuote=route;return;}
   data=fixture.quotes[url.searchParams.get('product')+':'+url.searchParams.get('options')];assert.ok(data,'Unexpected quote');
  }else if(url.pathname==='/api/broadband/orders'){
   submitted.push(JSON.parse(req.postData()));assert.equal(req.headers()['x-csrftoken'],'synthetic');
   if(reject){status=409;data={error:'Prices changed. Refresh the quote.'};}else data={id:'synthetic-order',message:'Order received. Nothing has been charged.'};
  }else throw Error('Unexpected API call '+url.pathname);
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const base=`http://127.0.0.1:${server.address().port}/broadband.html`;
 await page.goto(base);await page.locator('.card').last().waitFor();assert.equal(await page.locator('.card').count(),7);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(out,`catalogue-${width}.png`),fullPage:true});
 await page.locator('.card').filter({has:page.getByRole('heading',{name:'Direct UFB Fibre Broadband',exact:true})}).getByRole('button').click();
 await page.locator('#option-0').selectOption('3');await page.waitForFunction(()=>document.querySelector('#monthly').textContent==='$83.41');
 assert.equal(await page.locator('#setup').textContent(),'$10.00');assert.equal(await page.locator('#due').textContent(),'$93.41');
 assert.match(await page.locator('#signin').getAttribute('href'),/plan=ufb&options=3/);
 await page.locator('#option-0').selectOption('1');await page.waitForTimeout(80);await page.locator('#option-0').selectOption('3');
 await page.waitForFunction(()=>document.querySelector('#monthly').textContent==='$83.41');
 await holdQuote.fulfill({contentType:'application/json',body:JSON.stringify(fixture.quotes['ufb:1'])});await page.waitForTimeout(60);
 assert.equal(await page.locator('#monthly').textContent(),'$83.41');
 signedIn=true;await page.goto(base+'?plan=ufb&options=3');await page.locator('#order-form').waitFor();
 await page.locator('[name=contact_name]').fill('Synthetic Customer');await page.locator('[name=address]').fill('10 Synthetic Test Street');await page.locator('[name=postcode]').fill('1010');await page.locator('[name=accept_review]').check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:path.join(out,`configure-${width}.png`),fullPage:true});
 reject=true;await page.locator('#submit-order').click();await page.waitForFunction(()=>document.querySelector('#order-result').textContent.includes('Prices changed'));
 assert.equal(await page.locator('#order-inputs').isDisabled(),false);
 reject=false;await page.locator('#submit-order').click();await page.waitForFunction(()=>document.querySelector('#order-result').textContent.includes('synthetic-order'));
 assert.equal(submitted.length,2);assert.equal(submitted[1].product_id,'ufb');assert.deepEqual(submitted[1].selections,['3']);assert.equal(submitted[1].accept_review,true);assert.equal(submitted[1].quote_version,fixture.quotes['ufb:3'].quote_version);assert.equal(submitted[0].idempotency_key,submitted[1].idempotency_key);
 assert.equal(await page.locator('#submit-order').isDisabled(),true);assert.deepEqual(errors,[]);
 await page.goto(base+'?plan=vector&options=1,1,0,0');await page.waitForFunction(()=>document.querySelector('#setup').textContent==='To confirm');assert.equal(await page.locator('#due').textContent(),'To confirm');
 await context.close();
}console.log('Broadband desktop/phone catalogue, price race, sign-in selection and order submission checks passed.');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
