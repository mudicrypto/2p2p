CREATE TABLE "receipt_checks" (
	"file_key" text PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"flags" jsonb NOT NULL,
	"extracted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "warning" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payer_name_confirmed" boolean;--> statement-breakpoint
ALTER TABLE "receipt_checks" ADD CONSTRAINT "receipt_checks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_checks" ADD CONSTRAINT "receipt_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipt_checks_hash_idx" ON "receipt_checks" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "receipt_checks_order_idx" ON "receipt_checks" USING btree ("order_id");