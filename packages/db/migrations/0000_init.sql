CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"asset" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "address_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"active_at" timestamp with time zone NOT NULL,
	"risk_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"webauthn_at" timestamp with time zone,
	"ip" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"roles" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"side" text NOT NULL,
	"asset" text NOT NULL,
	"fiat" text NOT NULL,
	"price_type" text NOT NULL,
	"price" numeric(78,0),
	"margin_bps" integer,
	"min_amount" numeric(78,0) NOT NULL,
	"max_amount" numeric(78,0) NOT NULL,
	"total_amount" numeric(78,0) NOT NULL,
	"remaining_amount" numeric(78,0) NOT NULL,
	"payment_method_ids" jsonb NOT NULL,
	"payment_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_window_min" integer DEFAULT 15 NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"min_counterparty_tier" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_remaining_ck" CHECK ("ads"."remaining_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"sender_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"attachment_key" text,
	"attachment_status" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corridors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_fiat" text NOT NULL,
	"to_fiat" text NOT NULL,
	"asset" text NOT NULL,
	"buy_order_id" uuid,
	"sell_order_id" uuid,
	"fiat_in" numeric(78,0) NOT NULL,
	"fiat_out" numeric(78,0) NOT NULL,
	"effective_rate" numeric(78,0) NOT NULL,
	"market_rate" numeric(78,0) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "country_rules" (
	"country" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'allowed' NOT NULL,
	"tier0_allowed" boolean DEFAULT true NOT NULL,
	"tier_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limit_multiplier_bps" integer DEFAULT 10000 NOT NULL,
	"allowed_payment_methods" jsonb,
	"required_disclosures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"launch_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"memo" text,
	"custody_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"tx_hash" text NOT NULL,
	"from_address" text,
	"amount" numeric(78,0) NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"risk_score" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispute_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dispute_id" uuid NOT NULL,
	"user_id" uuid,
	"file_key" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"opened_by" uuid,
	"reason" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_arbiter_id" uuid,
	"decision" text,
	"split_buyer_bps" integer,
	"decision_note" text,
	"loser_id" uuid,
	"ai_summary" text,
	"ai_recommendation" text,
	"ai_confidence" integer,
	"sla_due_at" timestamp with time zone NOT NULL,
	"escalated_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_user" uuid NOT NULL,
	"to_user" uuid NOT NULL,
	"positive" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiat_currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"minor_units" smallint NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"min_order" numeric(78,0),
	"max_order" numeric(78,0),
	"rate_source" text DEFAULT 'median' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "freeze_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"bank_letter_key" text NOT NULL,
	"claimed_amount_fiat" numeric(78,0) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_asset" text,
	"payout_amount" numeric(78,0),
	"reviewed_by" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"response_code" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "kyc_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"level" smallint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_full_name_enc" text,
	"dob_enc" text,
	"country" text,
	"reject_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tx_id" bigint NOT NULL,
	"account_id" bigint NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(78,0) NOT NULL,
	CONSTRAINT "ledger_entries_nonzero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_tx" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limit_usage" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"used" numeric(78,0) DEFAULT 0 NOT NULL,
	CONSTRAINT "limit_usage_user_id_kind_period_pk" PRIMARY KEY("user_id","kind","period")
);
--> statement-breakpoint
CREATE TABLE "limits_config" (
	"tier" smallint NOT NULL,
	"asset" text NOT NULL,
	"daily_limit" numeric(78,0) NOT NULL,
	"monthly_limit" numeric(78,0) NOT NULL,
	"per_order_max" numeric(78,0) NOT NULL,
	"withdraw_daily" numeric(78,0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limits_config_tier_asset_pk" PRIMARY KEY("tier","asset")
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"ip" text,
	"fingerprint" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"secret_enc" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"deposit_amount" numeric(78,0) DEFAULT 0 NOT NULL,
	"deposit_asset" text DEFAULT 'USDT' NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"verified_badge" boolean DEFAULT false NOT NULL,
	"application" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"event" text NOT NULL,
	"actor" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"maker_id" uuid NOT NULL,
	"taker_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"fiat" text NOT NULL,
	"crypto_amount" numeric(78,0) NOT NULL,
	"fiat_amount" numeric(78,0) NOT NULL,
	"price" numeric(78,0) NOT NULL,
	"fee_amount" numeric(78,0) DEFAULT 0 NOT NULL,
	"fee_payer" text DEFAULT 'seller' NOT NULL,
	"usd_value_cents" numeric(78,0) DEFAULT 0 NOT NULL,
	"payment_method_id" uuid,
	"payment_type" text,
	"reference_code" text NOT NULL,
	"status" text NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"manual_confirm_required" boolean DEFAULT false NOT NULL,
	"hold_until" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"auto_confirmed" boolean DEFAULT false NOT NULL,
	"corridor_id" uuid,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_confirmations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"amount_match" boolean NOT NULL,
	"reference_match" boolean NOT NULL,
	"name_match" boolean NOT NULL,
	"payer_name_enc" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_method_types" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"countries" jsonb NOT NULL,
	"currencies" jsonb NOT NULL,
	"fields_schema" jsonb NOT NULL,
	"reversible" boolean DEFAULT false NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"verifier_available" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"opt_in" boolean DEFAULT false NOT NULL,
	"hold_hours" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"details_enc" text NOT NULL,
	"holder_name" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rates" (
	"asset" text NOT NULL,
	"fiat" text NOT NULL,
	"price" numeric(78,0) NOT NULL,
	"sources" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rates_asset_fiat_pk" PRIMARY KEY("asset","fiat")
);
--> statement-breakpoint
CREATE TABLE "compliance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"subject_user_id" uuid,
	"created_by" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reputation" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"trades_30d" integer DEFAULT 0 NOT NULL,
	"trades_total" integer DEFAULT 0 NOT NULL,
	"completion_rate_bps" integer DEFAULT 10000 NOT NULL,
	"avg_release_sec" integer DEFAULT 0 NOT NULL,
	"dispute_rate_bps" integer DEFAULT 0 NOT NULL,
	"disputes_lost" integer DEFAULT 0 NOT NULL,
	"freeze_reports" integer DEFAULT 0 NOT NULL,
	"positive_feedback" integer DEFAULT 0 NOT NULL,
	"negative_feedback" integer DEFAULT 0 NOT NULL,
	"volume_30d_usd_cents" numeric(78,0) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_flags" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"code" text NOT NULL,
	"severity" text NOT NULL,
	"details" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_id" uuid,
	"mfa_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"phone" text,
	"phone_verified_at" timestamp with time zone,
	"tg_id" text,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"security_changed_at" timestamp with time zone,
	"kyc_tier" smallint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"country" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"display_name" text,
	"is_merchant" boolean DEFAULT false NOT NULL,
	"sanctions_hit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_ck" CHECK ("users"."status" in ('active','frozen','banned')),
	CONSTRAINT "users_tier_ck" CHECK ("users"."kyc_tier" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"purpose" text NOT NULL,
	"target" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"admin_id" uuid,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_approvals" (
	"withdrawal_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_approvals_withdrawal_id_admin_id_pk" PRIMARY KEY("withdrawal_id","admin_id")
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"amount" numeric(78,0) NOT NULL,
	"fee" numeric(78,0) DEFAULT 0 NOT NULL,
	"usd_value_cents" numeric(78,0) DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"risk_score" integer,
	"required_approvals" smallint DEFAULT 0 NOT NULL,
	"custody_ref" text,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "address_allowlist" ADD CONSTRAINT "address_allowlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corridors" ADD CONSTRAINT "corridors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze_reports" ADD CONSTRAINT "freeze_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "freeze_reports" ADD CONSTRAINT "freeze_reports_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_applications" ADD CONSTRAINT "kyc_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tx_id_ledger_tx_id_fk" FOREIGN KEY ("tx_id") REFERENCES "public"."ledger_tx"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_usage" ADD CONSTRAINT "limit_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_api_keys" ADD CONSTRAINT "merchant_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_profiles" ADD CONSTRAINT "merchant_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_maker_id_users_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_taker_id_users_id_fk" FOREIGN KEY ("taker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_confirmations" ADD CONSTRAINT "payment_confirmations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_type_payment_method_types_code_fk" FOREIGN KEY ("type") REFERENCES "public"."payment_method_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation" ADD CONSTRAINT "reputation_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_approvals" ADD CONSTRAINT "withdrawal_approvals_withdrawal_id_withdrawals_id_fk" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."withdrawals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_approvals" ADD CONSTRAINT "withdrawal_approvals_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_owner_uq" ON "accounts" USING btree ("owner_type","owner_id","asset","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "allowlist_uq" ON "address_allowlist" USING btree ("user_id","network","address");--> statement-breakpoint
CREATE INDEX "ads_book_idx" ON "ads" USING btree ("asset","fiat","side","status","price");--> statement-breakpoint
CREATE INDEX "audit_subject_idx" ON "audit_log" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "chat_order_idx" ON "chat_messages" USING btree ("order_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_addr_user_uq" ON "deposit_addresses" USING btree ("user_id","asset","network");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_addr_uq" ON "deposit_addresses" USING btree ("network","address","memo");--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_tx_uq" ON "deposits" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_fp_uq" ON "devices" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "devices_fp_idx" ON "devices" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "devices_ip_idx" ON "devices" USING btree ("ip");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_order_open_uq" ON "disputes" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status","sla_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_order_from_uq" ON "feedback" USING btree ("order_id","from_user");--> statement-breakpoint
CREATE UNIQUE INDEX "freeze_reports_order_reporter_uq" ON "freeze_reports" USING btree ("order_id","reporter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_provider_ref_uq" ON "kyc_applications" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "kyc_user_idx" ON "kyc_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("tx_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_tx_idem_uq" ON "ledger_tx" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_tx_ref_idx" ON "ledger_tx" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "login_events_ip_idx" ON "login_events" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_ref_uq" ON "orders" USING btree ("reference_code");--> statement-breakpoint
CREATE INDEX "orders_status_exp_idx" ON "orders" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_seller_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "orders_corridor_idx" ON "orders" USING btree ("corridor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payconf_provider_ref_uq" ON "payment_confirmations" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "pm_user_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "risk_flags_subject_idx" ON "risk_flags" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "risk_flags_code_idx" ON "risk_flags" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_uq" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tg_uq" ON "users" USING btree ("tg_id");--> statement-breakpoint
CREATE INDEX "vt_target_idx" ON "verification_tokens" USING btree ("purpose","target");--> statement-breakpoint
CREATE INDEX "withdrawals_status_idx" ON "withdrawals" USING btree ("status");