-- audit_log and ledger tables are append-only (spec 0.2, 0.6).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_tx_append_only BEFORE UPDATE OR DELETE ON ledger_tx FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- Deferred constraint: every ledger_tx must balance to zero per asset at commit time.
CREATE OR REPLACE FUNCTION ledger_tx_balanced() RETURNS trigger AS $$
DECLARE bad record;
BEGIN
  SELECT asset, sum(amount) s INTO bad FROM ledger_entries WHERE tx_id = NEW.tx_id GROUP BY asset HAVING sum(amount) <> 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'ledger tx % unbalanced for asset % (sum %)', NEW.tx_id, bad.asset, bad.s;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_tx_balanced();
