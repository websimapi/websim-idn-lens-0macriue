import { createExplorer } from './explorer.js';
const form=document.querySelector('#convert-form');
const input=document.querySelector('#url-input');
const result=document.querySelector('#result');
const error=document.querySelector('#error');
const list=document.querySelector('#url-list');
const asciiOutput=document.querySelector('#ascii-result');
const count=document.querySelector('#verified-count');
const space=document.querySelector('#candidate-count');
const note=document.querySelector('#note');
const more=document.querySelector('#load-more');
const submit=form.querySelector('button');
let explorer=null, rows=[], generation=0, busy=false;
const dataPromise=Promise.all([
  fetch('./idna-mappings.json').then(r=>{if(!r.ok)throw Error('Unable to load Unicode mappings.');return r.json();}),
  fetch('./unicode-styles.json').then(r=>{if(!r.ok)throw Error('Unable to load Unicode styles.');return r.json();})
]);
// Retain the rejection for a useful inline error rather than an unhandled promise.
dataPromise.catch(()=>{});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

function readableNumber(n) {
  const value=n.toString();
  if(value.length<=18) return n.toLocaleString();
  return value[0]+'.'+value.slice(1,3)+' × 10^'+(value.length-1);
}
function rowElement(item,index) {
  const row=document.createElement('li'); row.className='url-row';
  const info=document.createElement('div');info.className='row-info';
  const label=document.createElement('div');label.className='row-label';
  label.textContent=String(index+1).padStart(2,'0')+' / '+item.name;
  const link=document.createElement('a');link.className='variant-link';
  link.textContent=item.unicode;link.setAttribute('href',item.unicode);
  link.target='_blank';link.rel='noopener noreferrer';
  info.append(label,link);
  const button=document.createElement('button');button.type='button';button.className='copy-button';
  button.textContent='Copy';button.dataset.index=String(index);
  button.setAttribute('aria-label','Copy '+item.name+' URL');
  row.append(info,button);return row;
}
async function loadBatch(token) {
  if(!explorer||busy)return;
  busy=true;more.disabled=true;more.textContent='Generating…';
  const current=explorer;let added=0, scanned=0, done=false;
  const fragment=document.createDocumentFragment();
  let sliceStart=performance.now();
  while(added<60 && scanned<20000) {
    if(token!==generation)return;
    const step=current.iterator.next();scanned++;
    if(step.done){done=true;break;}
    if(step.value){
      fragment.append(rowElement(step.value,rows.length));rows.push(step.value);added++;
    }
    if(performance.now()-sliceStart>12){await pause();sliceStart=performance.now();}
  }
  if(token!==generation)return;
  list.append(fragment);
  count.textContent=rows.length.toLocaleString()+' verified URL'+(rows.length===1?'':'s');
  more.hidden=done;more.disabled=false;more.textContent='Load 60 more ↓';busy=false;
  document.querySelector('#copy-list').disabled=!rows.length;
  if(done) {
    note.textContent=current.isIP?'IP addresses have no domain-name styling; the original URL is unchanged.':rows.length?'All combinations in this mapping set have been checked.':'No compatible special-character alternatives were found in this mapping set.';
  } else {
    note.textContent='Every listed URL parses back to the original in this browser. More combinations are available below.';
  }
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const token=++generation;busy=false;
  error.hidden=true;result.hidden=true;submit.disabled=true;
  submit.textContent='Generating…';
  try {
    const [data,styles]=await dataPromise;
    if(token!==generation)return;
    const raw=input.value;
    await pause();
    if(token!==generation)return;
    explorer=createExplorer(raw,data,styles);rows=[];list.replaceChildren();
    asciiOutput.textContent=explorer.ascii;
    count.textContent='Generating compatible URLs…';
    space.textContent=readableNumber(explorer.candidateCount)+' candidate combinations';
    space.title=explorer.candidateCount.toString()+' combinations before final validation and deduplication';
    result.hidden=false;more.hidden=false;
    await loadBatch(token);
  } catch(err) {
    if(token===generation){error.textContent=err.message||'Unable to generate URLs.';error.hidden=false;result.hidden=true;}
  } finally {
    if(token===generation){submit.disabled=false;submit.innerHTML='Convert <span aria-hidden="true">↗</span>';}
  }
});
input.addEventListener('input',()=>{
  generation++;busy=false;explorer=null;result.hidden=true;error.hidden=true;
  submit.disabled=false;submit.innerHTML='Convert <span aria-hidden="true">↗</span>';
});
more.addEventListener('click',()=>loadBatch(generation));
async function copy(button,text) {
  try {
    await navigator.clipboard.writeText(text);button.textContent='Copied';button.classList.add('copied');
    setTimeout(()=>{button.textContent=button.id==='copy-list'?'Copy list':'Copy';button.classList.remove('copied');},1400);
  } catch {
    button.textContent='Copy failed';setTimeout(()=>{button.textContent=button.id==='copy-list'?'Copy list':'Copy';},1400);
  }
}
list.addEventListener('click',event=>{
  const button=event.target.closest('button[data-index]');
  if(button)copy(button,rows[Number(button.dataset.index)].unicode);
});
document.querySelector('#copy-list').addEventListener('click',event=>copy(event.currentTarget,rows.map(r=>r.unicode).join('\n')));
document.querySelector('[data-copy="ascii"]').addEventListener('click',event=>copy(event.currentTarget,asciiOutput.textContent));
