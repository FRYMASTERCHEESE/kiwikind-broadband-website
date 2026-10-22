const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('owner never estimates retail prices using stale client-side add-ons',()=>{
const script=fs.readFileSync('owner-ops.js','utf8');
assert.ok(script.includes('secure server calculates the complete GST-inclusive customer prices'));
assert.ok(script.includes('Calculate exact customer totals'));
assert.ok(script.includes('await detail(kind,saved.id)'));
assert.ok(script.includes('vetta_owner_verified'));
assert.ok(!script.includes('Math.round(Number(a)*115/100)+300'));
assert.ok(!script.includes('api(\'payments/checkout\''));
assert.ok(!script.includes('vetta/orders'));
});
