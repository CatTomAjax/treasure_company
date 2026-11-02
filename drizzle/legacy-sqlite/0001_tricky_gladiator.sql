CREATE TABLE `serviceTickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`reporter` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_service_tickets_created` ON `serviceTickets` (`createdAt`);