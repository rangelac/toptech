CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer` text NOT NULL,
	`kind` text NOT NULL,
	`note` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_customer_date` ON `contacts` (`customer`,`created_at`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`platform_user` text NOT NULL,
	`expires_at` integer NOT NULL
);
