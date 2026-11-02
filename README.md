# XMR20 checkpoints

Daily, signed checkpoints of the XMR20 token ledger on Monero, with a script that checks them against the Monero chain.

> Experimental. XMR20 runs on Monero mainnet as a pilot.

## What this is

XMR20 tokens live in ordinary Monero transactions. To show balances, a wallet needs every transaction that carries an XMR20 record. Finding them by reading the whole Monero chain takes a long time, so XMR20 wallets start from a list of those transactions served by the XMR20 indexers, and check it themselves.

Once a day (every 720 Monero blocks, as soon as that block is 25 blocks deep) the XMR20 issuer signs a **checkpoint** of that list and posts it inside a normal Monero transaction, the **anchor**. A checkpoint says:

> At block *H* (block hash *X*) the XMR20 ledger has *N* records, and the list of them hashes to *L*.

This repository keeps a public copy of every checkpoint together with its full list of record transactions, so the ledger's history is on record outside XMR20's own servers and cannot be quietly changed later.

## What a wallet does with it

1. It downloads the list of record transactions (a few KB) and fetches each one from a Monero node itself. Every record is checked again on the device.
2. The list must match the newest signed checkpoint.
3. While the wallet reads its own blocks, every block's XMR20 records must be exactly the listed ones, in block order. If anything was left out or reordered, the wallet ignores the list and reads the token history from the chain instead.

## Check the checkpoints yourself

You need [Node.js](https://nodejs.org) 20 or newer. Nothing else to install.

```sh
git clone https://github.com/xmr20project/xmr20-checkpoints
cd xmr20-checkpoints
node verify.mjs
```

By default it uses public Monero nodes run by others (Cake Wallet, monerodevs.org, HashVault). To use your own node:

```sh
node verify.mjs --node http://127.0.0.1:18081
```

For each checkpoint it checks that:

1. the anchor transaction is in a block and carries a checkpoint signed by the XMR20 issuer key (`engine/manifest.json`);
2. the signed height, block hash, record count and list hash are the ones in the file;
3. that block hash is the chain's block at that height;
4. the file's list hashes to the signed list hash;
5. every listed transaction is in its listed block, in block order, and carries an XMR20 record.

## Files

| File | What it is |
| --- | --- |
| `anchors/<height>.json` | One checkpoint: `height`, `blockHash`, `records`, `listHash`, `anchorTx` (the Monero transaction with the signed checkpoint), `anchorBlock`, `postedAt`, `checkedOn` (the public node it was checked on) and `txs`, every record transaction up to the checkpoint in ledger order. |
| `anchors.json` | Index of all checkpoints, newest first. |
| `verify.mjs` | The checker described above. |
| `update.mjs`, `.github/workflows/update.yml` | Every 6 hours: read new checkpoints from the XMR20 bridge (`api.xmr20.org`), check each one on a public Monero node, add it. A checkpoint that fails the check is not added. |
| `engine/holder.wasm` | The XMR20 token engine, the same code the XMR20 wallets run (build paths removed); used here only for the signature and record checks. |
| `engine/manifest.json` | The public mainnet parameters (issuer key, ledger domain). |
| `engine/SHA256SUMS` | Hashes of the two engine files. |

## Formats

**List hash:** SHA-256 over one line per record transaction, `height:txid\n`, in ledger order, for every record up to and including the checkpoint block.

**Anchor:** 140 bytes in the anchor transaction's extra field:

| Bytes | Field |
| --- | --- |
| 4 | `XCK` followed by the byte `0xfd` |
| 4 | block height, little endian |
| 32 | block hash |
| 32 | list hash |
| 4 | record count, little endian |
| 64 | issuer signature (decaf377-rdsa, SpendAuth) over `XMR20-CHECKPOINT-v1\0`, the ledger domain and the 76 bytes above |

An anchor is not a token record: token readers ignore it, and no balance depends on it.

## Limits

- A checkpoint records what the issuer committed to at that block. That nothing was left out is checked by the wallets against the blocks they read, and anyone can compare the list with a full Monero node.
- The token ledger starts at Monero block 3,792,000. The first checkpoint is block 3,797,280 (2 November 2026).

More about XMR20: [xmr20.org](https://xmr20.org) · wallets: [xmr20-wallets](https://github.com/xmr20project/xmr20-wallets)
