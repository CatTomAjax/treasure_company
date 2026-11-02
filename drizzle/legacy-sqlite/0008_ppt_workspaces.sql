CREATE TABLE `pptFiles` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ppt_files_company` ON `pptFiles` (`companyId`);--> statement-breakpoint
CREATE TABLE `pptWorkspaces` (
	`companyId` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`version` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ppt_state_json" CHECK(json_valid("pptWorkspaces"."state"))
);
