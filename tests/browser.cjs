// Synthetic API responses only. Real Google/MFA/Stripe require an owner-authenticated release check.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=process.env.PAGES_SCREENSHOTS||'test-results/pages';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1365]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   let signedIn=false,ownerVerified=false,blocked=false,ownerSave=null;
   await page.route('https://accounts.google.com/**',route=>route.abort());
   await page.route('https://kiwikind-backend.onrender.com/api/**',async route=>{
    const req=route.request();const endpoint=new URL(req.url()).pathname.slice(5);
    let data={};let status=200;
    if(endpoint==='bootstrap')data={csrfToken:'synthetic-csrf',registration_enabled:true,intake_enabled:false,account:signedIn?{email:'synthetic@example.invalid'}:null};
    else if(endpoint==='pages/cookie-probe'){if(blocked){status=403;data={error:'Cookies blocked'};}else data={cookies:true};}
    else if(endpoint==='pages/session-probe')data={session_cookie:!blocked};
    else if(endpoint==='login'){signedIn=true;data={email:'synthetic@example.invalid',csrfToken:'rotated-synthetic-csrf'};}
    else if(endpoint==='me')data={email:'synthetic@example.invalid'};
    else if(endpoint==='orders')data={orders:[]};else if(endpoint==='tickets')data={tickets:[]};else if(endpoint==='invoices')data={invoices:[]};
    else if(endpoint==='logout'){signedIn=false;data={message:'Signed out'};}
    else if(endpoint==='owner/state')data={enabled:true,identity_verified:true,mfa_verified:ownerVerified};
    else if(endpoint==='owner/operations')data={collections:[{name:'customers',label:'Customers'},{name:'tickets',label:'Tickets'}]};
    else if(endpoint==='owner/operations/customers')data={kind:'customers',columns:['email','is_active'],total:1,page:1,rows:[{id:'123',email:'synthetic@example.invalid',is_active:true}],create:false};
    else if(endpoint==='owner/operations/customers/123'){
      if(req.method()==='POST')ownerSave=JSON.parse(req.postData());
      data={kind:'customers',id:'123',editable:true,version:'signed-synthetic-version',record:{email:'synthetic@example.invalid'},fields:[{name:'first_name',label:'First name',value:ownerSave?.values.first_name||'Synthetic',type:'text',required:false},{name:'is_active',label:'Active',value:true,type:'checkbox',required:false}]};
    }
    else if(endpoint==='owner/sandbox-runs')data={runs:[]};
    else if(endpoint==='owner/mfa'){if(req.method()==='POST'){ownerVerified=true;data={mfa_verified:true};}else data={enrolling:false,setup_key:''};}
    else if(endpoint==='owner/readiness')data={checks:[{done:false,label:'Synthetic sandbox evidence',detail:'Provider lifecycle not verified by this test.'}]};
    else if(endpoint==='owner/catalogue')data={plans:[{name:'Synthetic private quote',network:'Test network',wholesale_ex_gst:'40.00',retail_ex_gst:null,review_status:'draft'}],csv_columns:['name','download_mbps']};
    await route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':base,'Access-Control-Allow-Credentials':'true'},body:JSON.stringify(data)});
   });
   await page.goto(base+'/account.html#signin');
   await page.locator('#auth-submit:not([disabled])').waitFor();
   await page.locator('#auth-form input[name=email]').fill('synthetic@example.invalid');
   await page.locator('#auth-form input[name=password]').fill('Synthetic-test-password');
   await page.locator('#auth-submit').click();await page.locator('#dashboard:not(.hidden)').waitFor();
   assert.equal(await page.locator('#account-email').textContent(),'synthetic@example.invalid');
   await page.locator('#portal').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`customer-${width}.png`),fullPage:true});
   await page.reload();await page.locator('#dashboard:not(.hidden)').waitFor();
   await page.locator('#top-logout').click();await page.locator('#dashboard').waitFor({state:'hidden'});
   await page.goto(base+'/account.html#signup');await page.locator('#auth-submit:not([disabled])').waitFor();
   assert.equal(await page.locator('#auth-title').textContent(),'Create your account');
   await page.goto(base+'/owner.html');await page.locator('#mfa:not([hidden])').waitFor();
   assert.equal(await page.locator('#private').isVisible(),false);
   await page.locator('input[name=code]').fill('123456');await page.locator('#mfa-form button').click();
   await page.locator('#private:not([hidden])').waitFor();
   await page.getByRole('button',{name:'Customers',exact:true}).click();
   await page.locator('#ops-content').getByRole('button',{name:'Open',exact:true}).click();
   await page.locator('#ops-edit-form input[name=first_name]').fill('Updated synthetic');
   await page.getByRole('button',{name:'Save private record',exact:true}).click();
   await page.locator('#ops-edit-form input[name=first_name]').waitFor();
   assert.equal(ownerSave.values.first_name,'Updated synthetic');assert.equal(ownerSave.version,'signed-synthetic-version');
   assert.equal(Object.hasOwn(ownerSave.values,'password'),false);
   await page.screenshot({path:path.join(out,`owner-${width}.png`),fullPage:true});
   assert.equal(await page.locator('#setup-key').textContent(),'');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
   blocked=true;await page.goto(base+'/account.html#signin');
   await page.getByText(/could not establish a secure session/).waitFor();
   assert.equal(await page.locator('#auth-submit').isDisabled(),true);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Desktop and phone synthetic UI checks passed: sign-in, restore, logout, registration, MFA, private catalogue, blocked cookies.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
