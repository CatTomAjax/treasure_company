CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`taskId` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activities_created` ON `activities` (`createdAt`);--> statement-breakpoint
CREATE TABLE `flows` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`brief` text NOT NULL,
	`audience` text NOT NULL,
	`channel` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`source` text NOT NULL,
	`comment` text NOT NULL,
	`dueDate` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_updated` ON `tasks` (`updatedAt`);