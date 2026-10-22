const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const page=fs.readFileSync('owner.html','utf8'),ops=fs.readFileSync('owner-ops.js','utf8');
test('launch links are inside the MFA-gated owner section and leave supplier/public flags unchanged',()=>{
 const privateStart=page.indexOf('<section id="private" hidden');
 const handoff=page.indexOf('<details id="owner-launch-handoff"');
 const last=page.indexOf('Private Vetta price catalogue',handoff);
 assert.ok(privateStart>=0&&handoff>privateStart&&last>handoff);
 assert.ok(page.includes('Review Vetta supplier framework'));
 assert.ok(ops.includes("()=>collection('providers')"));
 assert.ok(!page.includes('href="https://kiwikind-backend.onrender.com'));
 assert.ok(page.includes('/actions/runs/39829195047'));
 assert.ok(page.includes('version code 15'));
 assert.ok(page.includes('It has not been confirmed as a Google Play update.'));
 assert.ok(!page.includes('sk_live_'));
 assert.ok(!page.includes('vetta/orders'));
 assert.ok(!page.includes('action="/api/payments/checkout"'));
});