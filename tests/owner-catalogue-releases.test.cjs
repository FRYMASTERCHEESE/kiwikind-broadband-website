const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

class Element{
  constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.value='';this.events={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(){}
  set innerHTML(_){throw Error('Private values must use text nodes');}
}
const text=node=>node.textContent+' '+node.children.map(text).join(' ');
const row={source:{name:'Synthetic <plan>',family:'ufb',description:'Synthetic',source_ref:'synthetic-source',
  base:'42.00',baseSetup:'0.00',setupUnknown:true,allowance:'Synthetic data',terms:'Synthetic terms',unverified:['Setup'],groups:[]},
  retail_preview:{monthly_cents:6000,setup_cents:null,first_invoice_cents:null},default_selections:[]};
function create(api){
  const hosts={'release-list':new Element('div'),'release-detail':new Element('div')};
  const document={hidden:false,getElementById:id=>hosts[id],createElement:tag=>new Element(tag)};
  const context={window:{},document};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../owner-catalogue-releases.js'),'utf8'),context);
  const review=context.window.KiwiKindCatalogueReview.create({api,action:fn=>fn,node:(tag,value)=>new Element(tag,value)});
  return {review,hosts,document};
}
const list={releases:[{id:7,products:1,active:false,approved:false,verified_on:null,valid_until:null}]};
const details={release:{products:1,active:false,checksum:'synthetic-digest'},products:[row]};
test('source review uses read-only calls, text nodes, and unknown setup totals',async()=>{
  const calls=[];const {review,hosts}=create(async(...args)=>{calls.push(args);return args[0].endsWith('/7')?details:list;});
  await review.load();await hosts['release-list'].children[0].children[2].events.click();
  assert.match(text(hosts['release-detail']),/Synthetic <plan>/);
  assert.match(text(hosts['release-detail']),/setup Not confirmed; first payment Not confirmed/);
  assert.ok(calls.every(call=>call.length===1));
});
test('logout or clear during a pending source read cannot redisplay private prices',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done);
  const {review,hosts}=create(async path=>path.endsWith('/7')?pending:list);
  await review.load();const request=hosts['release-list'].children[0].children[2].events.click();
  review.clear();resolve(details);await request;
  assert.equal(hosts['release-list'].children.length,0);
  assert.equal(hosts['release-detail'].children.length,0);
});
test('a hidden page does not render a completed source read',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done);
  const {review,hosts,document}=create(async path=>path.endsWith('/7')?pending:list);
  await review.load();const request=hosts['release-list'].children[0].children[2].events.click();
  document.hidden=true;review.clear();resolve(details);await request;
  assert.equal(hosts['release-detail'].children.length,0);
});
