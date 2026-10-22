// Source safety: plain-language help must not bypass availability, payment or MFA.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('broadband.html','utf8');
const script=fs.readFileSync('broadband.js','utf8');
const home=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('broadband.css','utf8');

test('plan finder covers fibre, rural, copper and unknown with native buttons',()=>{
  for (const situation of ['fibre','rural','copper','unsure']) {
    assert.ok(html.includes('data-situation="'+situation+'"'));
    assert.ok(script.includes(situation+': {'));
  }
  assert.ok(html.includes('id="finder-result"'));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(script.includes("setAttribute('aria-pressed'"));
  assert.ok(script.includes('guide.plans'));
  assert.ok(css.includes('.finder-choices'));
  assert.ok(css.includes('max-width:500px'));
});

test('rural advice checks address before wireless; home fibre uses server options',()=>{
  assert.ok(script.includes("Rural homes can have fibre too"));
  assert.ok(script.includes("500Mbps Down / 100Mbps Up"));
  assert.ok(script.includes("['See RBI Rural plans', 'rbi']"));
  assert.ok(script.includes("['See Fixed Wireless plans', 'fixed-wireless']"));
  assert.ok(script.includes("product.groups.map(group=>group.options[0].id)"));
  assert.ok(script.includes("group.options.find(o=>o.name===speedName)"));
  assert.ok(html.includes('https://broadbandmap.nz/'));
  assert.ok(html.includes('guidance, not an address availability check'));
});

test('explain modem compatibility without claiming all equipment works',()=>{
  assert.ok(html.includes('not every modem is compatible'));
  assert.ok(html.includes('Ethernet WAN/Internet port'));
  assert.ok(html.includes('exact router model'));
  assert.ok(home.includes('Will my existing Spark or other modem/router work?'));
  assert.ok(home.includes('broadband.html#plan-finder'));
});

test('price display is an estimate until KiwiKind verifies supplier setup',()=>{
  assert.ok(html.includes('Estimated setup once, incl. GST'));
  assert.ok(html.includes('Estimated first month + setup'));
  assert.ok(html.includes('Supplier installation, churn, equipment'));
  assert.ok(html.includes('No payment is taken when you send an address request'));
  assert.ok(script.includes("configure(product,preferredOptions(product,preferredSpeed))"));
  assert.ok(!script.includes('api/payments/checkout'));
  assert.ok(!script.includes('vetta/orders'));
  assert.ok(!script.includes('PLAN_PUBLICATION_ENABLED'));
});
