const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=name=>fs.readFileSync(name,'utf8');

test('one-dollar test is only shown inside private verified owner centre',()=>{
  const owner=read('owner.html'),script=read('owner.js');
  assert.ok(owner.includes('id="private" hidden'));
  assert.ok(owner.indexOf('id="one-dollar"')>owner.indexOf('id="private" hidden'));
  assert.ok(owner.indexOf('id="one-dollar"')<owner.indexOf('<details id="owner-advanced-qa">'));
  assert.match(owner,/one-time NZ\$1 live Stripe payment/);
  assert.ok(script.includes("api('owner/dollar-verification/checkout',{confirm_one_time_live_nzd_1:true})"));
  assert.ok(script.includes('result.mode!==\'payment\''));
  assert.ok(script.includes('result.recurring!==false'));
  assert.ok(script.includes('result.amount_cents!==100'));
  assert.ok(script.includes('stripeLiveCheckout(result.url)'));
  assert.ok(script.includes('one-dollar-consent'));
  assert.ok(!script.includes("api('payments/checkout'"));
});

test('customer billing page hides NZ$1 card until private owner MFA API verifies',()=>{
  const html=read('account.html'),script=read('account.js');
  assert.ok(html.includes('id="owner-dollar-payment" class="hidden"'));
  assert.ok(script.includes("api('owner/dollar-verification',undefined,generation)"));
  assert.ok(script.includes('catch{return;} // Do not reveal private payment verification'));
  assert.ok(script.includes("api('owner/dollar-verification/checkout',{confirm_one_time_live_nzd_1:true},generation)"));
  assert.ok(script.includes('reply.recurring!==false'));
  assert.ok(script.includes('reply.amount_cents!==100'));
  assert.ok(script.includes('liveCheckoutUrl(reply.url)'));
  assert.ok(!html.includes('sk_live_'));
  assert.ok(!script.includes('stripe.PaymentIntent.create'));
});
