-- New accounts get full limits from day one (an admin can lower newAccountLimitBps again).
UPDATE system_config SET value = value || '{"newAccountLimitBps": 10000}'::jsonb, updated_at = now() WHERE key = 'cooldowns';
