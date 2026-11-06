import { createDb } from '@p2p/db';
import { checkInvariants } from '@p2p/core';
const h = createDb(process.env.DATABASE_URL);
const r = await checkInvariants(h.db);
console.log(JSON.stringify({ invariantsOk: r.ok, assets: r.perAsset.map((p) => `${p.asset}:${p.ledgerSum}`) }));
await h.close();
if (!r.ok) process.exit(1);
