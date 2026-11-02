// Loads the XMR20 token engine (holder.wasm: JSON over a small C ABI, no wasm-bindgen). Only two of its operations are used here:
// checkpointVerify (an anchor transaction's issuer-signed checkpoint) and recordEntries (a transaction carries an XMR20 record).
const enc=new TextEncoder(),dec=new TextDecoder();
export async function createEngine(wasmBytes,random=b=>crypto.getRandomValues(b)){
 let memory;
 const imports={env:{xmr20_random(ptr,len){try{random(new Uint8Array(memory.buffer,ptr,len));return 0;}catch{return 1;}}}};
 const {instance}=await WebAssembly.instantiate(wasmBytes,imports);
 const x=instance.exports;memory=x.memory;x.xmr20_init();
 const read=(ptr,len)=>dec.decode(new Uint8Array(memory.buffer,ptr,len));
 const panicText=()=>{const n=x.xmr20_panic_len();return n?read(x.xmr20_panic_ptr(),n):'';};
 const put=bytes=>{const ptr=x.xmr20_alloc(bytes.length);new Uint8Array(memory.buffer,ptr,bytes.length).set(bytes);return ptr;};
 const finish=len=>{const v=JSON.parse(read(x.xmr20_out_ptr(),len));if(v.error)throw Error(v.error);return v.result;};
 return {call(request){try{const bytes=enc.encode(JSON.stringify(request));return finish(x.xmr20_call(put(bytes),bytes.length));}
  catch(e){if(e instanceof WebAssembly.RuntimeError)throw Error('Engine fault: '+(panicText()||e.message));throw e;}}};
}
