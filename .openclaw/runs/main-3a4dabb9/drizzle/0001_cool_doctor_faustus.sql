CREATE TABLE `explicit_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`priority` integer DEFAULT 10 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `explicit_memories_user_created` ON `explicit_memories` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `level`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `current_xp`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `required_xp`;