CREATE TABLE `businessAiLocks` (
	`runId` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `businessAiSteps` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`runId` text NOT NULL,
	`step` integer NOT NULL,
	`roleId` text NOT NULL,
	`content` text NOT NULL,
	`sources` text NOT NULL,
	`provider` text NOT NULL,
	`inputTokens` integer DEFAULT 0 NOT NULL,
	`outputTokens` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`companyId`,`runId`) REFERENCES `businessRecords`(`companyId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_ai_step_unique` ON `businessAiSteps` (`runId`,`step`);--> statement-breakpoint
CREATE TABLE `businessAutomations` (
	`companyId` text NOT NULL,
	`sourceId` text NOT NULL,
	`action` text NOT NULL,
	`targetId` text NOT NULL,
	PRIMARY KEY(`sourceId`, `action`)
);
--> statement-breakpoint
CREATE TABLE `businessFiles` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`recordId` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`size` integer NOT NULL,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`companyId`,`recordId`) REFERENCES `businessRecords`(`companyId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `businessHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`recordId` text NOT NULL,
	`actorId` text NOT NULL,
	`actorName` text NOT NULL,
	`action` text NOT NULL,
	`snapshot` text NOT NULL,
	`createdAt` text NOT NULL,
	CONSTRAINT "business_snapshot_json" CHECK(json_valid("businessHistory"."snapshot"))
);
--> statement-breakpoint
CREATE INDEX `idx_business_history` ON `businessHistory` (`companyId`,`recordId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `businessImportBatches` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`kind` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `businessNoticeInbox` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`noticeId` text NOT NULL,
	`senderCompanyId` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT '未读' NOT NULL,
	`response` text DEFAULT '' NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_inbox_unique` ON `businessNoticeInbox` (`companyId`,`noticeId`);--> statement-breakpoint
CREATE TABLE `businessRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`dueDate` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "business_data_json" CHECK(json_valid("businessRecords"."data"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_tenant_id` ON `businessRecords` (`companyId`,`id`);--> statement-breakpoint
CREATE INDEX `idx_business_tenant_kind` ON `businessRecords` (`companyId`,`kind`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_business_due` ON `businessRecords` (`companyId`,`dueDate`,`status`);--> statement-breakpoint
CREATE TABLE `businessRelations` (
	`companyId` text NOT NULL,
	`recordId` text NOT NULL,
	`field` text NOT NULL,
	`targetId` text NOT NULL,
	PRIMARY KEY(`recordId`, `field`),
	FOREIGN KEY (`companyId`,`recordId`) REFERENCES `businessRecords`(`companyId`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companyId`,`targetId`) REFERENCES `businessRecords`(`companyId`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platformLoginAttempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platformMembers` (
	`userId` text NOT NULL,
	`companyId` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`userId`, `companyId`),
	FOREIGN KEY (`userId`) REFERENCES `platformUsers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "platform_role_check" CHECK("platformMembers"."role" IN ('admin','manager','member','viewer'))
);
--> statement-breakpoint
CREATE TABLE `platformSessions` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `platformUsers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platformUsers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`salt` text NOT NULL,
	`passwordHash` text NOT NULL,
	`isAdmin` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platformUsers_email_unique` ON `platformUsers` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_meter_serial ON businessRecords(companyId,json_extract(data,'$.serial')) WHERE kind='meter';
--> statement-breakpoint
CREATE TRIGGER business_booking_overlap BEFORE UPDATE ON businessRecords WHEN NEW.kind='booking' AND NEW.status='已确认' BEGIN
 SELECT RAISE(ABORT,'booking_overlap') WHERE EXISTS(SELECT 1 FROM businessRecords r WHERE r.companyId=NEW.companyId AND r.kind='booking' AND r.status='已确认' AND r.id<>NEW.id AND json_extract(r.data,'$.spaceId')=json_extract(NEW.data,'$.spaceId') AND json_extract(r.data,'$.start')<json_extract(NEW.data,'$.end') AND json_extract(r.data,'$.end')>json_extract(NEW.data,'$.start'));
END;
--> statement-breakpoint
CREATE TRIGGER business_lease_overlap BEFORE UPDATE ON businessRecords WHEN NEW.kind='lease' AND NEW.status='已确认' BEGIN
 SELECT RAISE(ABORT,'lease_overlap') WHERE EXISTS(SELECT 1 FROM businessRecords r WHERE r.companyId=NEW.companyId AND r.kind='lease' AND r.status='已确认' AND r.id<>NEW.id AND json_extract(r.data,'$.spaceId')=json_extract(NEW.data,'$.spaceId') AND json_extract(r.data,'$.startDate')<=json_extract(NEW.data,'$.endDate') AND json_extract(r.data,'$.endDate')>=json_extract(NEW.data,'$.startDate'));
END;
--> statement-breakpoint
CREATE TRIGGER business_insert_audit AFTER INSERT ON businessRecords BEGIN
 INSERT INTO businessHistory(id,companyId,recordId,actorId,actorName,action,snapshot,createdAt) VALUES(lower(hex(randomblob(16))),NEW.companyId,NEW.id,'system','系统','创建',json_object('title',NEW.title,'owner',NEW.owner,'status',NEW.status,'data',json(NEW.data),'version',NEW.version),NEW.updatedAt);
END;
--> statement-breakpoint
CREATE TRIGGER business_update_audit AFTER UPDATE ON businessRecords BEGIN
 INSERT INTO businessHistory(id,companyId,recordId,actorId,actorName,action,snapshot,createdAt) VALUES(lower(hex(randomblob(16))),NEW.companyId,NEW.id,'system','系统','版本更新',json_object('title',NEW.title,'owner',NEW.owner,'status',NEW.status,'data',json(NEW.data),'version',NEW.version),NEW.updatedAt);
END;
