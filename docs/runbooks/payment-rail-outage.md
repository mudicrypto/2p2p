# Payment rail (verifier) outage

Auto-confirmation is an optimization: orders on that rail fall back to the normal manual flow (buyer marks paid, seller releases). Actions: confirm with the provider; if the verifier is producing wrong data (e.g. payer names missing → third-party flags), disable it by unsetting `<RAIL>_WEBHOOK_SECRET` (falls back to manual) and announce in the affected countries. Review auto-released orders in the incident window against provider statements.
