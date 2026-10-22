const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('website labels provisional rates and verified fibre installation correctly',()=>{
 const js=fs.readFileSync('broadband.js','utf8');
 const html=fs.readFileSync('broadband.html','utf8');
 assert.ok(js.includes("!['verified','verified_speed_address_review_required','screen_checked'].includes(product.price_status)"));
 assert.ok(js.includes("!['verified','verified_speed_address_review_required','screen_checked'].includes(q.price_status)"));
 assert.ok(js.includes('Supplier rate to be confirmed before payment'));
 assert.ok(js.includes('Rate checked; address and setup fees still need confirmation'));
 assert.ok(html.includes('Estimated setup once, incl. GST'));
 assert.ok(html.includes('Estimated first month + setup'));
 assert.ok(js.includes("api('broadband/quote?"));
 assert.ok(!js.includes('api/payments/checkout'));
 assert.ok(!js.includes('vetta/orders'));
});
