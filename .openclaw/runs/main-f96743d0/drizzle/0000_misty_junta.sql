CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text,
	`last_message_preview` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`scope_type` text DEFAULT 'general',
	`scope_id` text,
	`scope_label` text,
	`scope_source` text,
	`scope_route` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_conv_user_updated` ON `chat_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `chat_conv_user_scope` ON `chat_conversations` (`user_id`,`scope_type`,`scope_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_msg_conv_created` ON `chat_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `doc_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_doc_id` text NOT NULL,
	`target_title_normalized` text NOT NULL,
	`target_doc_id` text,
	FOREIGN KEY (`source_doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_links_source` ON `doc_links` (`source_doc_id`);--> statement-breakpoint
CREATE INDEX `doc_links_target_doc` ON `doc_links` (`target_doc_id`);--> statement-breakpoint
CREATE INDEX `doc_links_target_title` ON `doc_links` (`target_title_normalized`);--> statement-breakpoint
CREATE UNIQUE INDEX `doc_links_source_target_unique` ON `doc_links` (`source_doc_id`,`target_title_normalized`);--> statement-breakpoint
CREATE TABLE `doc_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` text NOT NULL,
	`tag` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `doc_tags_doc_id` ON `doc_tags` (`doc_id`);--> statement-breakpoint
CREATE INDEX `doc_tags_tag` ON `doc_tags` (`tag`);--> statement-breakpoint
CREATE UNIQUE INDEX `doc_tags_doc_tag_unique` ON `doc_tags` (`doc_id`,`tag`);--> statement-breakpoint
CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`title_normalized` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`file_type` text DEFAULT '.md' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `docs_user_updated` ON `docs` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `docs_user_title_norm` ON `docs` (`user_id`,`title_normalized`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notes_user_status_updated` ON `notes` (`user_id`,`completed`,`updated_at`);--> statement-breakpoint
CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal` text NOT NULL,
	`difficulty` text DEFAULT 'normal' NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`date` text NOT NULL,
	`completed_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quests_user_status_date` ON `quests` (`user_id`,`completed`,`date`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text DEFAULT 'system' NOT NULL,
	`status` text DEFAULT 'info' NOT NULL,
	`source` text DEFAULT 'OpenClaw' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_user_date` ON `reports` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'Adventurer' NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`current_xp` integer DEFAULT 0 NOT NULL,
	`required_xp` integer DEFAULT 100 NOT NULL,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`join_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
