const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const landing=read('index.html');
const privacy=read('privacy.html');
const terms=read('terms.html');
const deletion=read('account-deletion.html');
const workflow=read('.github/workflows/deploy.yml');

test('GitHub Pages remains the public front page with secure separate account portal',()=>{
 assert.ok(landing.includes('A kinder <em>connection.</em>'));
 assert.ok(landing.includes('https://kiwikind-backend.onrender.com/#signin'));
 assert.ok(landing.includes('https://kiwikind-backend.onrender.com/#signup'));
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
 assert.ok(terms.includes('No live broadband products'));
 assert.ok(terms.includes('No live service-support SLA'));
});
test('business identity is correct and public broadband sales remain off',()=>{
 assert.ok(landing.includes('KiwiKind Broadband Limited · NZBN 9429054036550'));
 assert.ok(terms.includes('company number'));
 assert.ok(landing.includes('No broadband services currently offered'));
 assert.ok(landing.includes('No plans are currently published.'));
 assert.ok(terms.includes('does not authorise live payments'));
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
 assert.ok(workflow.includes('for asset in privacy.html terms.html account-deletion.html policy.css plans.js; do'));
 assert.ok(!workflow.includes('cp -r'));
});
