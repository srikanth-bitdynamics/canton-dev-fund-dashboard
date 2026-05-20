CREATE TABLE `budget_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`period_name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_budget_cc` integer NOT NULL,
	`notes` text,
	`is_current` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_periods_period_name_unique` ON `budget_periods` (`period_name`);--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`milestone_number` integer NOT NULL,
	`title` text,
	`funding_cc` integer DEFAULT 0 NOT NULL,
	`estimated_delivery` text,
	`estimated_delivery_date` text,
	`focus` text,
	`acceptance` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`board_status` text,
	`github_issue_number` integer,
	`approved_at` text,
	`payment_released_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`amount_cc` integer NOT NULL,
	`scheduled_date` text,
	`released_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_hash` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`github_pr_number` integer,
	`pr_state` text,
	`pr_merged` integer DEFAULT false,
	`in_repo` integer DEFAULT false,
	`title` text NOT NULL,
	`author` text,
	`author_email` text,
	`github_author` text,
	`champion` text,
	`status` text DEFAULT 'submitted' NOT NULL,
	`category` text,
	`raw_category` text,
	`labels` text,
	`total_funding_cc` integer DEFAULT 0 NOT NULL,
	`created_date` text,
	`updated_date` text,
	`approved_date` text,
	`quarter` text,
	`website` text,
	`twitter` text,
	`raw_content_hash` text,
	`parse_warnings` text,
	`synced_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_filename_unique` ON `proposals` (`filename`);--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_type` text NOT NULL,
	`source` text,
	`status` text DEFAULT 'started' NOT NULL,
	`items_processed` integer DEFAULT 0,
	`errors` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` integer NOT NULL,
	`github_login` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`role` text DEFAULT 'viewer' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_github_id_unique` ON `users` (`github_id`);