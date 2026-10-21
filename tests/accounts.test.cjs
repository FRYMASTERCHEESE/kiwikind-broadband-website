const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('Pages account and owner assets contain no server secrets or session storage',()=>{
 for(const name of ['account.html','account.js','readiness.js','owner.html','owner.js','owner-ops.js','owner-scenarios.js']){
  const body=fs.readFileSync(name,'utf8');
  assert.doesNotMatch(body,/sk_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|postgresql:\/\/|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(body,/href="https:\/\/kiwikind-backend\.onrender\.com/);
 }
});
test('account transport uses credentialed API and fails closed for cookie blocking',()=>{
 const body=fs.readFileSync('account.js','utf8');
 assert.match(body,/credentials: 'include'/);assert.match(body,/pages\/cookie-probe/);assert.match(body,/pages\/session-probe/);
 assert.match(body,/ux_mode:'popup'/);assert.doesNotMatch(body,/login_uri/);
});
