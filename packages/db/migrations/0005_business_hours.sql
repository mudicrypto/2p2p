ALTER TABLE "users" ADD COLUMN "business_hours" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "off_hours" boolean DEFAULT false NOT NULL;