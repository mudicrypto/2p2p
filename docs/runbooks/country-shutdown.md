# Switching a country off (or on)

Per-country launch flag, no deploy: admin → Country rules → set `launchEnabled=false` (or `status=blocked`). Effect within seconds (cache ≤ 2 s per instance): signups and new orders/ads for users in that country are refused (`COUNTRY_BLOCKED`, HTTP 451). Open orders continue to completion/cancellation so escrow resolves normally; withdrawals remain possible unless a legal order says otherwise (then freeze the affected users). Post the change on the status page and update required disclosures.
