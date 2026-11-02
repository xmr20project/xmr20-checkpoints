// Adds new XMR20 checkpoints to anchors/ (run by .github/workflows/update.yml every 6 hours). Reads the bridge's public checkpoint
// list and token-record list, takes each checkpoint whose anchor transaction is already in a block, checks it with verify.mjs on an
// independent public Monero node, then writes anchors/<height>.json and anchors.json. A checkpoint that fails the check stops the
// run with an error and nothing is written.
import {readFile,writeFile,readdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {join,dirname} from 'node:path';
import {pickNode,loadEngine,verifyCheckpoint,NotMinedYet} from './verify.mjs';
const here=dirname(fileURLToPath(import.meta.url)),BRIDGE='https://api.xmr20.org/api/private-bridge';
const action=async(name,body)=>{const r=await fetch(BRIDGE+'/action/'+name,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 const v=await r.json();if(!r.ok)throw Error(name+': '+(v.error||r.status));return v;};
const have=new Set((await readdir(join(here,'anchors'))).filter(f=>f.endsWith('.json')).map(f=>Number(f.slice(0,-5))));
const C=await action('checkpoints',{}),fresh=(C.anchors||[]).filter(a=>!have.has(a.height)).sort((x,y)=>x.height-y.height);
// One listed transaction per line, so a new checkpoint reads as a short diff.
const format=(head,txs)=>JSON.stringify(head,null,1).replace(/\n}$/,',\n "txs": [\n'+txs.map(t=>'  '+JSON.stringify(t)).join(',\n')+'\n ]\n}\n');
const chain=await pickNode(),engine=await loadEngine();let added=0;
if(fresh.length){const L=await action('ledgerTxs',{from:0});
 for(const a of fresh){const cp={height:a.height,blockHash:a.blockHash,records:a.records,listHash:a.listHash,anchorTx:a.txid,postedAt:a.at,txs:L.txs.filter(t=>t.height<=a.height).map(t=>({height:t.height,txid:t.txid}))};
  try{const r=await verifyCheckpoint(cp,{chain,engine});cp.anchorBlock=r.anchorBlock;cp.checkedOn=r.node;}
  catch(e){if(e instanceof NotMinedYet){console.log(e.message+'; next run');continue;}throw e;}
  const {txs,...head}=cp;await writeFile(join(here,'anchors',cp.height+'.json'),format(head,txs));have.add(cp.height);added++;console.log(`added checkpoint ${cp.height} (${cp.records} records, checked on ${cp.checkedOn})`);}}
const all=[];for(const h of [...have].sort((x,y)=>y-x)){const {txs,...head}=JSON.parse(await readFile(join(here,'anchors',h+'.json'),'utf8'));all.push(head);}
const index={network:'mainnet',every:C.every,depth:C.depth,latest:all[0]?.height??null,checkpoints:all};
const before=await readFile(join(here,'anchors.json'),'utf8').catch(()=>'');const after=JSON.stringify(index,null,1)+'\n';if(after!==before)await writeFile(join(here,'anchors.json'),after);
console.log(added?`${added} new checkpoint(s)`:'no new checkpoint');
