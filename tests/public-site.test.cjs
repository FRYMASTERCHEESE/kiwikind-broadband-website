const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const landing=read('index.html');
const privacy=read('privacy.html');
const terms=read('terms.html');
const deletion=read('account-deletion.html');
const workflow=read('.github/workflows/deploy.yml');

test('GitHub Pages hosts the front page and account portal',()=>{
 assert.ok(landing.includes('A kinder <em>connection.</em>'));
 assert.ok(landing.includes('./account.html#signin'));
 assert.ok(landing.includes('./account.html#signup'));
 assert.ok(landing.includes('This GitHub Pages website hosts KiwiKind public information'));
 assert.ok(!landing.includes('href="/admin/"'));
 assert.ok(!landing.includes('https://kiwikind-backend.onrender.com/#privacy'));
 assert.ok(!landing.includes('https://kiwikind-backend.onrender.com/#terms'));
});
test('public privacy terms and deletion pages work without waking the backend',()=>{
 for(const file of ['privacy.html','terms.html','account-deletion.html']){
  const body=read(file);
  assert.ok(body.includes('<html lang="en-NZ">'));
  assert.ok(body.includes('viewport'));
  assert.ok(body.includes('mailto:kiwikindbroadband@gmail.com'));
  assert.ok(body.includes('./privacy.html'));
  assert.ok(body.includes('./account-deletion.html'));
 }
 for(const file of ['privacy.html','terms.html','account-deletion.html']){
  assert.ok(landing.includes('href="./'+file+'"'));
 }
 assert.ok(privacy.includes('href="./terms.html"'));
 assert.ok(deletion.includes('href="./terms.html"'));
 assert.ok(terms.includes('No payment is taken and no service is activated at that stage.'));
 assert.ok(terms.includes('No live service-support SLA'));
});
test('business identity and confirmation-before-payment flow are clear',()=>{
 assert.ok(landing.includes('KiwiKind Broadband Limited · NZBN 9429054036550'));
 assert.ok(terms.includes('company number'));
 assert.ok(landing.includes('Broadband orders are subject to address and connection confirmation'));
 assert.ok(landing.includes('./broadband.html'));
 assert.ok(terms.includes('payment requires your separate acceptance of the final offer'));
});
test('never leak server credentials, private quotes or supplier contracts',()=>{
 for(const file of ['index.html','privacy.html','terms.html','account-deletion.html','plans.js']){
  const contents=read(file);
  for(const secret of [/sk_test_[A-Za-z0-9]+/,/sk_live_[A-Za-z0-9]+/,/whsec_[A-Za-z0-9]+/,
   /STRIPE_TEST_SECRET_KEY/,/PRIVATE-QUOTE-/,/Vetta_Trading_Ltd_Master_Services_Agreement/,
   /api\/billing\/checkout/]){
    assert.equal(secret.test(contents),false,file+' contains private content');
  }
 }
});
test('the Pages deploy tests and exports only allowlisted public files',()=>{
 assert.ok(workflow.includes('node --test tests/*.test.cjs'));
 assert.ok(workflow.indexOf('node --test tests/*.test.cjs')<workflow.indexOf('Stage only approved public assets'));
 assert.ok(workflow.includes('account.html account.js account.css readiness.js owner.html owner.js owner.css owner-ops.js owner-scenarios.js broadband.html broadband.js broadband.css navigation.css navigation.js; do'));
 assert.ok(!workflow.includes('cp -r'));
});

test('simple Pages navigation keeps customer journeys inside the website',()=>{
 const nav=read('navigation.js');const css=read('navigation.css');
 for(const page of ['index.html','broadband.html','account.html','owner.html']){
  assert.ok(read(page).includes('src="./navigation.js"'));
  assert.ok(read(page).includes('href="./navigation.css"'));
 }
 assert.ok(nav.includes('My orders'));
 assert.ok(nav.includes('Payment offers'));
 assert.ok(nav.includes('Support'));
 assert.ok(nav.includes('Find a broadband type'));
 assert.ok(nav.includes('No Vetta order is placed automatically'));
 assert.ok(read('account.html').includes('id="customer-orders"'));
 assert.ok(!read('account.html').includes('No domain purchased'));
 assert.ok(css.includes('.kk-shortcuts'));
});

test('owner request-review shortcut is MFA-gated and does not submit Vetta orders',()=>{
 const ops=read('owner-ops.js');
 const page=read('owner.html');
 assert.ok(ops.includes("item.name==='requests'"));
 assert.ok(ops.includes('Start here: review broadband requests'));
 assert.ok(ops.includes("()=>collection('requests')"));
 assert.ok(page.includes('Confirm each address and connection'));
 assert.ok(!ops.includes('vetta/orders'));
});
