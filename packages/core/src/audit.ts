import { auditLog, type DbOrTx } from '@p2p/db';
import { jsonBigint } from '@p2p/shared';

export interface AuditEntry {
  actorType: 'user' | 'admin' | 'system';
  actorId?: string | null;
  action: string;
  subjectType?: string;
  subjectId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}
const clean = (v: unknown) => (v === undefined ? null : JSON.parse(JSON.stringify(v, jsonBigint)));

/** Append-only audit write. Always call inside the same transaction as the change it records. */
export async function audit(db: DbOrTx, e: AuditEntry) {
  await db.insert(auditLog).values({
    actorType: e.actorType, actorId: e.actorId ?? null, action: e.action,
    subjectType: e.subjectType, subjectId: e.subjectId, before: clean(e.before), after: clean(e.after), ip: e.ip ?? null,
  });
}
