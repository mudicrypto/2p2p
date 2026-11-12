// Post-load verification: no double spend, ledger balanced, escrow == open orders, ad remaining consistent.
import { createDb, sql } from '@p2p/db';
import { checkInvariants } from '@p2p/core';
const h = createDb(process.env.DATABASE_URL);
const inv = await checkInvariants(h.db);
const adCheck = await h.db.execute(sql`select a.id, a.total_amount - a.remaining_amount as used, coalesce(sum(o.crypto_amount) filter (where o.status in ('AWAITING_PAYMENT','PAID','DISPUTED','COMPLETED')),0) as orders from ads a left join orders o on o.ad_id = a.id where a.terms = '' group by a.id having a.total_amount - a.remaining_amount <> coalesce(sum(o.crypto_amount) filter (where o.status in ('AWAITING_PAYMENT','PAID','DISPUTED','COMPLETED')),0)`);
const escrowCheck = await h.db.execute(sql`with esc as (select a.owner_id, sum(e.amount) bal from accounts a join ledger_entries e on e.account_id = a.id where a.kind = 'escrow' group by a.owner_id),
  open as (select seller_id::text owner_id, sum(crypto_amount + case when fee_payer = 'seller' then fee_amount else 0 end) amt from orders where status in ('AWAITING_PAYMENT','PAID','DISPUTED') group by seller_id)
  select coalesce(esc.owner_id, open.owner_id) owner, esc.bal, open.amt from esc full join open on esc.owner_id = open.owner_id where coalesce(esc.bal,0) <> coalesce(open.amt,0)`);
const dup = await h.db.execute(sql`select buyer_id, count(*) from orders group by buyer_id, ad_id having count(*) > 1 and min(created_at) > now() - interval '1 hour' limit 5`);
console.log(JSON.stringify({ invariantsOk: inv.ok, unbalancedTx: inv.unbalancedTx.length, negativeAccounts: inv.negativeAccounts.length, adMismatches: adCheck.rows.length, escrowMismatches: escrowCheck.rows.length, duplicateOrders: dup.rows.length }));
await h.close();
if (!inv.ok || adCheck.rows.length || escrowCheck.rows.length) process.exitCode = 1;
