// Checks XMR20 checkpoints against the Monero chain. Node.js 20 or newer, no packages to install.
//   node verify.mjs                          every checkpoint in anchors/
//   node verify.mjs 3797280                  one checkpoint
//   node verify.mjs --node https://your-node:18089
// For each checkpoint file, on a Monero node of your choice (default: the first public node below that answers):
//   1. the anchor transaction is in a block and carries a checkpoint signed by the XMR20 issuer key (engine/manifest.json)
//   2. the signed height, block hash, record count and list hash are the ones in the file
//   3. that block hash is the chain's block at that height
//   4. the file's list hashes to the signed list hash (SHA-256 over "height:txid\n" lines)
//   5. every listed transaction is in its listed block, in block order, and carries an XMR20 record
import {readFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {join,dirname} from 'node:path';
import {createEngine} from './engine/engine.mjs';
const here=dirname(fileURLToPath(import.meta.url));
export const NODES=['https://xmr-node.cakewallet.com:18081','https://node.monerodevs.org:18089','http://nodes.hashvault.pro:18081'];
export class NotMinedYet extends Error {}
export function monero(node){
 const post=async(path,body)=>{for(let attempt=0;;attempt++){try{const r=await fetch(node+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
   if(r.ok)return r.json();if(attempt>=3||![429,500,502,503,504].includes(r.status))throw Error(node+path+': HTTP '+r.status);}catch(e){if(attempt>=3)throw e;}await new Promise(d=>setTimeout(d,2000*(attempt+1)));}};
 const rpc=async(method,params={})=>{const v=await post('/json_rpc',{jsonrpc:'2.0',id:'0',method,params});if(v.error)throw Error(method+': '+v.error.message);return v.result;};
 // A public (restricted) node answers at most 100 transactions per request.
 const txs=async ids=>{const out=[];for(let i=0;i<ids.length;i+=100){const v=await post('/get_transactions',{txs_hashes:ids.slice(i,i+100),decode_as_json:false});out.push(...(v.txs||[]));}return new Map(out.map(t=>[t.tx_hash,t]));};
 return {node,rpc,txs};
}
export async function pickNode(nodes=NODES){for(const n of nodes){try{const m=monero(n);const i=await m.rpc('get_info');if(i.nettype==='mainnet'&&i.synchronized!==false)return m;}catch{}}throw Error('No Monero node answered: '+nodes.join(', '));}
export async function loadEngine(){
 const manifest=JSON.parse(await readFile(join(here,'engine/manifest.json'),'utf8'));
 const engine=await createEngine(await readFile(join(here,'engine/holder.wasm')));engine.call({op:'params',manifest});return engine;
}
export const listHash=txs=>createHash('sha256').update(txs.map(t=>t.height+':'+t.txid+'\n').join('')).digest('hex');
export async function verifyCheckpoint(cp,{chain,engine}){
 const fail=m=>{throw Error(`checkpoint ${cp.height}: ${m}`);};
 // 1–2. The anchor transaction and its signed checkpoint.
 const a=(await chain.txs([cp.anchorTx])).get(cp.anchorTx);if(!a)fail('anchor transaction not found');if(a.in_pool)throw new NotMinedYet(`checkpoint ${cp.height}: anchor transaction not in a block yet`);
 const v=engine.call({op:'checkpointVerify',txid:cp.anchorTx,hex:a.as_hex});
 for(const k of ['height','blockHash','listHash','records'])if(v[k]!==cp[k])fail(`signed ${k} ${v[k]} differs from the file (${cp[k]})`);
 if(a.block_height<cp.height)fail('anchor transaction is older than its checkpoint');
 // 3. The checkpoint block is the chain's.
 if((await chain.rpc('get_block_header_by_height',{height:cp.height})).block_header.hash!==cp.blockHash)fail('block hash differs from the chain');
 // 4. The list.
 const list=cp.txs;if(list.length!==cp.records)fail('list length differs from the record count');
 if(list.some((t,i)=>t.height>cp.height||(i&&t.height<list[i-1].height)))fail('list out of height order or past the checkpoint');
 if(new Set(list.map(t=>t.txid)).size!==list.length)fail('a transaction is listed twice');
 if(listHash(list)!==cp.listHash)fail('list hash differs from the signed one');
 // 5. Each listed transaction: in its block, in block order, carrying an XMR20 record.
 const got=await chain.txs(list.map(t=>t.txid));
 for(const t of list){const x=got.get(t.txid);if(!x||x.in_pool||x.block_height!==t.height)fail(`${t.txid} is not in block ${t.height}`);
  engine.call({op:'recordEntries',txs:[{txid:t.txid,height:t.height,hex:x.as_hex}]});}
 const heights=[...new Set(list.map(t=>t.height))].filter(h=>list.filter(t=>t.height===h).length>1);
 for(const h of heights){const order=(await chain.rpc('get_block',{height:h})).tx_hashes||[];const at=list.filter(t=>t.height===h).map(t=>order.indexOf(t.txid));
  if(at.some((p,i)=>p<0||(i&&p<at[i-1])))fail(`records in block ${h} are not in block order`);}
 return {height:cp.height,records:cp.records,anchorTx:cp.anchorTx,anchorBlock:a.block_height,node:chain.node};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),ni=args.indexOf('--node');const nodes=ni>=0?[args.splice(ni,2)[1]]:NODES;
 const chain=await pickNode(nodes),engine=await loadEngine();
 const files=args.length?args.map(h=>h+'.json'):(await readdir(join(here,'anchors'))).filter(f=>f.endsWith('.json')).sort();
 let bad=0;for(const f of files){const cp=JSON.parse(await readFile(join(here,'anchors',f),'utf8'));
  try{const r=await verifyCheckpoint(cp,{chain,engine});console.log(`OK  checkpoint ${r.height}: ${r.records} records, anchor ${r.anchorTx.slice(0,12)}… in block ${r.anchorBlock} (node ${r.node})`);}
  catch(e){bad++;console.log('FAIL '+e.message);}}
 if(!files.length)console.log('No checkpoints yet.');process.exitCode=bad?1:0;
}
