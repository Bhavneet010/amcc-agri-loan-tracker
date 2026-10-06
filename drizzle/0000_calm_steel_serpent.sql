CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`actor` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_name_unique` ON `branches` (`name`);--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`category` text NOT NULL,
	`ats_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`remarks` text DEFAULT '' NOT NULL,
	`compliance` text DEFAULT 'none' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_ats_unique` ON `loans` (`branch_id`,`category`,`ats_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
