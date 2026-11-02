CREATE TABLE `modelCatalogs` (
	`connectionId` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`models` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`connectionId`) REFERENCES `integrationConnections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "model_catalog_json" CHECK(json_valid("modelCatalogs"."models"))
);
--> statement-breakpoint
CREATE TABLE `modelPreferences` (
	`companyId` text NOT NULL,
	`projectId` text DEFAULT '' NOT NULL,
	`connectionId` text NOT NULL,
	`model` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updatedBy` text NOT NULL,
	`updatedAt` text NOT NULL,
	PRIMARY KEY(`companyId`, `projectId`),
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connectionId`) REFERENCES `integrationConnections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `modelTests` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`connectionId` text NOT NULL,
	`connectionVersion` text NOT NULL,
	`model` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`latencyMs` integer NOT NULL,
	`inputTokens` integer DEFAULT 0 NOT NULL,
	`outputTokens` integer DEFAULT 0 NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL,
	`actor` text NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connectionId`) REFERENCES `integrationConnections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_model_tests` ON `modelTests` (`companyId`,`connectionId`,`createdAt`);