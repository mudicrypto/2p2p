-- Unverified users (tier 0): $10,000 per day trading and withdrawals, $100,000 per month (USD cents).
UPDATE limits_config SET daily_limit = 1000000, monthly_limit = 10000000, per_order_max = 1000000, withdraw_daily = 1000000, updated_at = now() WHERE tier = 0 AND asset = 'USD';
