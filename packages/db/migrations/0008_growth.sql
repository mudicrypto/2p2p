CREATE TABLE "price_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset" text NOT NULL,
	"fiat" text NOT NULL,
	"best_ask" numeric(78,0),
	"best_bid" numeric(78,0),
	"market" numeric(78,0),
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"code" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "promoted_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_snapshots_pair_idx" ON "price_snapshots" USING btree ("asset","fiat","at");