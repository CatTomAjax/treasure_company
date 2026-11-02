CREATE TABLE `businessFileChunks` (
	`fileId` text NOT NULL,
	`part` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`fileId`, `part`),
	FOREIGN KEY (`fileId`) REFERENCES `businessFiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `integrationCallbacks` (
	`connectionId` text NOT NULL,
	`eventId` text NOT NULL,
	`payloadHash` text NOT NULL,
	`receivedAt` text NOT NULL,
	PRIMARY KEY(`connectionId`, `eventId`)
);
--> statement-breakpoint
CREATE TABLE `integrationConnections` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`testStatus` text DEFAULT 'not_tested' NOT NULL,
	`testMessage` text DEFAULT '' NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `financeCompanies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "integration_config_json" CHECK(json_valid("integrationConnections"."config"))
);
--> statement-breakpoint
CREATE INDEX `idx_connections_company` ON `integrationConnections` (`companyId`,`provider`);--> statement-breakpoint
CREATE TABLE `integrationEvents` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`connectionId` text NOT NULL,
	`jobId` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integrationJobs` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`connectionId` text NOT NULL,
	`recordId` text NOT NULL,
	`recordVersion` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`result` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`maxAttempts` integer DEFAULT 3 NOT NULL,
	`nextRetryAt` text DEFAULT '' NOT NULL,
	`remoteId` text DEFAULT '' NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`connectionId`) REFERENCES `integrationConnections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`companyId`,`recordId`) REFERENCES `businessRecords`(`companyId`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "integration_payload_json" CHECK(json_valid("integrationJobs"."payload")),
	CONSTRAINT "integration_result_json" CHECK(json_valid("integrationJobs"."result"))
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_company` ON `integrationJobs` (`companyId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `integrationSecrets` (
	`connectionId` text NOT NULL,
	`field` text NOT NULL,
	`nonce` text NOT NULL,
	`ciphertext` text NOT NULL,
	PRIMARY KEY(`connectionId`, `field`),
	FOREIGN KEY (`connectionId`) REFERENCES `integrationConnections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `integrationUsage` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`recordId` text NOT NULL,
	`connectionId` text NOT NULL,
	`model` text NOT NULL,
	`inputTokens` integer NOT NULL,
	`outputTokens` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledgeImports` (
	`companyId` text NOT NULL,
	`hash` text NOT NULL,
	`recordId` text NOT NULL,
	`count` integer NOT NULL,
	`createdAt` text NOT NULL,
	PRIMARY KEY(`companyId`, `hash`)
);
--> statement-breakpoint
CREATE TRIGGER collection_plan_limit BEFORE UPDATE ON businessRecords WHEN NEW.kind='collectionPlan' AND NEW.status IN ('已确认','已归档') BEGIN
 SELECT RAISE(ABORT,'collection_plan_limit') WHERE (SELECT COALESCE(SUM(CAST(ROUND(CAST(json_extract(data,'$.amount') AS REAL)*100) AS INTEGER)),0) FROM businessRecords WHERE companyId=NEW.companyId AND kind='collectionPlan' AND id<>NEW.id AND status IN ('已确认','已归档') AND json_extract(data,'$.orderId')=json_extract(NEW.data,'$.orderId'))+CAST(ROUND(CAST(json_extract(NEW.data,'$.amount') AS REAL)*100) AS INTEGER)>(SELECT CAST(ROUND(CAST(json_extract(data,'$.amount') AS REAL)*100) AS INTEGER) FROM businessRecords WHERE id=json_extract(NEW.data,'$.orderId'));
END;
--> statement-breakpoint
CREATE TRIGGER collection_bill_limit BEFORE INSERT ON businessAutomations WHEN NEW.action='collectionPlan.bill' BEGIN
 SELECT RAISE(ABORT,'collection_plan_limit') WHERE (SELECT COALESCE(SUM(f.amountCents),0) FROM businessAutomations a JOIN businessRecords p ON p.id=a.sourceId JOIN financeBills f ON f.id=a.targetId WHERE a.companyId=NEW.companyId AND a.action='collectionPlan.bill' AND json_extract(p.data,'$.orderId')=(SELECT json_extract(data,'$.orderId') FROM businessRecords WHERE id=NEW.sourceId) AND f.status<>'void')+(SELECT amountCents FROM financeBills WHERE id=NEW.targetId)>(SELECT CAST(ROUND(CAST(json_extract(data,'$.amount') AS REAL)*100) AS INTEGER) FROM businessRecords WHERE id=(SELECT json_extract(data,'$.orderId') FROM businessRecords WHERE id=NEW.sourceId));
END;
