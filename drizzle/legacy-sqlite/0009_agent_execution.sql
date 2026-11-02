CREATE TABLE `agentEvents` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`companyId` text NOT NULL,
	`runId` text NOT NULL,
	`taskId` text DEFAULT '' NOT NULL,
	`generation` integer NOT NULL,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`companyId`,`runId`) REFERENCES `agentRuns`(`companyId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agent_events_replay` ON `agentEvents` (`companyId`,`runId`,`seq`);--> statement-breakpoint
CREATE TABLE `agentPolicies` (
	`companyId` text NOT NULL,
	`projectId` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updatedBy` text NOT NULL,
	`updatedAt` text NOT NULL,
	PRIMARY KEY(`companyId`, `projectId`),
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_policy_json" CHECK(json_valid("agentPolicies"."config"))
);
--> statement-breakpoint
CREATE TABLE `agentRuns` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`projectId` text DEFAULT '' NOT NULL,
	`sceneId` text NOT NULL,
	`title` text NOT NULL,
	`goal` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`policy` text NOT NULL,
	`snapshot` text NOT NULL,
	`directives` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`checks` text DEFAULT '' NOT NULL,
	`sensitive` integer DEFAULT 0 NOT NULL,
	`createdBy` text NOT NULL,
	`approvedBy` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`leaseToken` text DEFAULT '' NOT NULL,
	`leaseUntil` text DEFAULT '' NOT NULL,
	`controlToken` text DEFAULT '' NOT NULL,
	`authorization` text DEFAULT 'null' NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_run_status" CHECK("agentRuns"."status" IN ('queued','running','paused','checking','awaiting_review','approved','failed','cancelled')),
	CONSTRAINT "agent_run_policy" CHECK(json_valid("agentRuns"."policy")),
	CONSTRAINT "agent_run_snapshot" CHECK(json_valid("agentRuns"."snapshot")),
	CONSTRAINT "agent_run_directives" CHECK(json_valid("agentRuns"."directives")),
	CONSTRAINT "agent_run_authorization" CHECK(json_valid("agentRuns"."authorization"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_runs_company_id` ON `agentRuns` (`companyId`,`id`);--> statement-breakpoint
CREATE INDEX `idx_agent_runs_company` ON `agentRuns` (`companyId`,`projectId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `agentSlots` (
	`id` integer PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`runId` text NOT NULL,
	`token` text NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agent_slots_tenant` ON `agentSlots` (`companyId`,`expiresAt`);--> statement-breakpoint
CREATE TABLE `agentTasks` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`runId` text NOT NULL,
	`spec` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`inputTokens` integer DEFAULT 0 NOT NULL,
	`outputTokens` integer DEFAULT 0 NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`startedAt` text DEFAULT '' NOT NULL,
	`finishedAt` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`companyId`,`runId`) REFERENCES `agentRuns`(`companyId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "agent_task_spec" CHECK(json_valid("agentTasks"."spec")),
	CONSTRAINT "agent_task_sources" CHECK(json_valid("agentTasks"."sources"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tasks_run_id` ON `agentTasks` (`runId`,`id`);--> statement-breakpoint
CREATE INDEX `idx_agent_tasks_run` ON `agentTasks` (`companyId`,`runId`);