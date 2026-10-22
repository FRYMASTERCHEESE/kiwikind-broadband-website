const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ops=fs.readFileSync('owner-ops.js','utf8');
test('owner approval requires a current server-calculated quote',()=>{
  assert.ok(ops.includes("api('owner/retail-price-preview'"));
  assert.ok(ops.includes('source_monthly_cents:Number(a)'));
  assert.ok(ops.includes('source_setup_cents:Number(b)'));
  assert.ok(ops.includes("form.dataset.serverPriceReady='yes'"));
  assert.ok(ops.includes("form.dataset.serverPriceReady='no'"));
  assert.ok(ops.includes("result.monthly_cents+result.setup_cents!==result.first_invoice_cents"));
  assert.ok(ops.includes('approvalButton.disabled=approving&&('));
  assert.ok(ops.includes('form.elements.confirm_live_offer?.checked!==true'));
  assert.ok(ops.includes('result.saved!==false'));
  assert.ok(ops.includes('result.approved!==false'));
  assert.ok(!ops.includes('Math.round(Number(a)*115/100)+300'));
  assert.ok(!ops.includes('vetta/orders'));
  assert.ok(!ops.includes('payments/checkout'));
});