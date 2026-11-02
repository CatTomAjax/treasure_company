CREATE TABLE `financeAccounts` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`openingCents` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financeAudit` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`billId` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financeBills` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`counterparty` text NOT NULL,
	`category` text NOT NULL,
	`date` text NOT NULL,
	`dueDate` text NOT NULL,
	`amountCents` integer NOT NULL,
	`paidCents` integer DEFAULT 0 NOT NULL,
	`taxBps` integer NOT NULL,
	`invoiceNo` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`reviewNote` text DEFAULT '' NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`version` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_finance_company_bills` ON `financeBills` (`companyId`,`date`);--> statement-breakpoint
CREATE TABLE `financeCompanies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financeDocuments` (
	`billId` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financePayments` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`billId` text NOT NULL,
	`accountId` text NOT NULL,
	`amountCents` integer NOT NULL,
	`date` text NOT NULL,
	`reference` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_finance_company_payments` ON `financePayments` (`companyId`,`date`);--> statement-breakpoint
ALTER TABLE `financeEntries` ADD `companyId` text DEFAULT 'park' NOT NULL;--> statement-breakpoint
ALTER TABLE `financeEntries` ADD `accountId` text;--> statement-breakpoint
ALTER TABLE `financeEntries` ADD `paymentId` text;--> statement-breakpoint
CREATE INDEX `idx_finance_company_entries` ON `financeEntries` (`companyId`,`date`);
--> statement-breakpoint
INSERT INTO financeCompanies VALUES ('park','前海创客中心 · 运营账套',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
--> statement-breakpoint
CREATE UNIQUE INDEX idx_finance_company_name ON financeCompanies(name);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_finance_account_name ON financeAccounts(companyId,name);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_finance_bill_invoice ON financeBills(companyId,kind,invoiceNo) WHERE invoiceNo<>'' AND status<>'void';
--> statement-breakpoint
CREATE UNIQUE INDEX idx_finance_payment_entry ON financeEntries(paymentId) WHERE paymentId IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_finance_entry_invoice ON financeEntries(companyId,direction,invoiceNo) WHERE invoiceNo<>'' AND status<>'void' AND paymentId IS NULL;
