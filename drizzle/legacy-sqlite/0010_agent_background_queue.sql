CREATE TABLE `agentJobs` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`runId` text NOT NULL,
	`generation` integer NOT NULL,
	`status` text NOT NULL,
	`requestedBy` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`availableAt` text NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`token` text DEFAULT '' NOT NULL,
	`lastError` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`requestedBy`) REFERENCES `platformUsers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companyId`,`runId`) REFERENCES `agentRuns`(`companyId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_job_status" CHECK("agentJobs"."status" IN ('queued','running','retry_wait','done','paused','cancelled','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_job_generation` ON `agentJobs` (`companyId`,`runId`,`generation`);--> statement-breakpoint
CREATE INDEX `agent_job_queue` ON `agentJobs` (`status`,`availableAt`);--> statement-breakpoint
CREATE TABLE `agentWorkers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`heartbeatAt` text NOT NULL,
	`leaseUntil` text NOT NULL
);
