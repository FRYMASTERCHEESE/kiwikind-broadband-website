// No outdated plan fixture may be used to rebuild the Vetta catalogue.
// Browser test confirms a reset source shows zero plans at all supported widths.
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=process.env.PAGES_SCREENSHOTS||'test-results/broadband';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+req.url.split('?')[0]);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try {
    res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');
    res.end(fs.readFileSync(file));
  } catch {res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try {
    for(const width of [320,390,1365]){
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],apiCalls=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://kiwikind-backend.onrender.com/api/**',async route=>{
        const request=route.request(),endpoint=new URL(request.url()).pathname;
        apiCalls.push(request.method()+' '+endpoint);
        assert.equal(request.method(),'GET','No order or payment request is allowed during empty catalogue testing');
        if(endpoint==='/api/broadband/catalogue'){
          await route.fulfill({contentType:'application/json',body:JSON.stringify({
            products:[],catalogue_version:'unpublished',orders_enabled:false,
            currency:'NZD',gst_included:true,supplier_orders_enabled:false
          })});
        } else if(endpoint==='/api/bootstrap'){
          await route.fulfill({contentType:'application/json',body:JSON.stringify({account:null,csrfToken:'synthetic'})});
        } else {
          throw Error('Unexpected API endpoint '+endpoint);
        }
      });
      await page.goto('http://127.0.0.1:'+server.address().port+'/broadband.html');
      await page.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('cleared all previous broadband plans'));
      assert.equal(await page.locator('#cards article.card').count(),0);
      assert.equal(await page.locator('#plan-finder').isHidden(),true);
      assert.equal(await page.locator('#configure').isHidden(),true);
      assert.match(await page.locator('#notice').textContent(),/No prices, download speeds or upload speeds/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      assert.ok(apiCalls.every(call=>call.startsWith('GET ')));
      await page.screenshot({path:path.join(out,'empty-'+width+'.png'),fullPage:true});
      await context.close();
    }

    // Arbitrary synthetic values exercise grouping without any recovered supplier fixture.
    for(const width of [320,390,1365]){
      const context=await browser.newContext({viewport:{width,height:900}});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      const variants=['a','b'].map(id=>({id:'synthetic-'+id,family:'ufb',name:'Synthetic option '+id,
        description:'Synthetic network and speed description '+id,allowance:'Synthetic allowance '+id,
        price_status:'verified',headline_monthly_cents:id==='a'?115:230,
        groups:[{id:'connection',label:'Synthetic connection',options:[{id:'included',name:'Synthetic existing connection'}]}],
        default_quote:{monthly_cents:id==='a'?115:230,setup_cents:0,first_invoice_cents:id==='a'?115:230}}));
      await page.route('https://kiwikind-backend.onrender.com/api/**',async route=>{
        const request=route.request(),url=new URL(request.url());
        assert.equal(request.method(),'GET');
        let data;
        if(url.pathname==='/api/broadband/catalogue')data={products:variants,consent_version:'synthetic',orders_enabled:true};
        else if(url.pathname==='/api/bootstrap')data={account:null,csrfToken:'synthetic'};
        else if(url.pathname==='/api/broadband/quote'){
          assert.equal(url.searchParams.get('product'),'synthetic-b');
          data={...variants[1].default_quote,name:variants[1].name,product_id:variants[1].id,
            options:[],usage:[],price_status:'verified',selections:['included'],quote_version:'synthetic'};
        }else throw Error('Unexpected synthetic endpoint '+url.pathname);
        await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
      });
      await page.goto('http://127.0.0.1:'+server.address().port+'/broadband.html');
      await page.locator('#cards article.card').waitFor();
      assert.equal(await page.locator('#cards article.card').count(),1);
      const select=page.getByRole('combobox',{name:'Direct UFB Fibre Broadband option',exact:true});
      await select.selectOption('synthetic-b');
      assert.match(await page.locator('.card .allowance').textContent(),/Synthetic allowance b/);
      assert.match(await page.locator('.card .fine').textContent(),/Monthly \$2.30; Setup once: \$0.00/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:path.join(out,'grouped-synthetic-'+width+'.png'),fullPage:true});
      await page.locator('.card').getByRole('button',{name:'Choose options',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#monthly').textContent==='$2.30');
      assert.equal(await page.locator('#setup').textContent(),'$0.00');
      assert.equal(await page.locator('#service-name').textContent(),'Synthetic option b');
      assert.deepEqual(errors,[]);
      await context.close();
    }

    console.log('All cleared: 0 plan cards, no hardcoded speed selectors, no order or payment requests.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
