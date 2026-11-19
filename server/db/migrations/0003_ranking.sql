CREATE TABLE "mailbox_profiles" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"correspondents" jsonb NOT NULL,
	"facts_check" text NOT NULL,
	"scores_version" integer DEFAULT 0 NOT NULL,
	"sent_scanned_at" timestamp with time zone,
	"listed_at" timestamp with time zone,
	"synced_at" timestamp with time zone,
	"syncing_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unread_messages" (
	"account_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"facts" jsonb,
	"answers" jsonb,
	"judge" text,
	"tried_at" timestamp with time zone,
	"score" real,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unread_messages_account_id_message_id_pk" PRIMARY KEY("account_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "mailbox_profiles" ADD CONSTRAINT "mailbox_profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unread_messages" ADD CONSTRAINT "unread_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;