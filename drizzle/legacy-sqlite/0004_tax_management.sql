CREATE TABLE `taxDocuments` (
	`invoiceId` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `taxFilings` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`taxType` text NOT NULL,
	`periodStart` text NOT NULL,
	`periodEnd` text NOT NULL,
	`deadline` text NOT NULL,
	`owner` text NOT NULL,
	`amountCents` integer NOT NULL,
	`status` text NOT NULL,
	`filingNo` text DEFAULT '' NOT NULL,
	`filedDate` text DEFAULT '' NOT NULL,
	`paymentReference` text DEFAULT '' NOT NULL,
	`paidDate` text DEFAULT '' NOT NULL,
	`note` text NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tax_filing_due` ON `taxFilings` (`companyId`,`deadline`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tax_filing_period` ON `taxFilings` (`companyId`,`taxType`,`periodStart`,`periodEnd`) WHERE status<>'void';--> statement-breakpoint
CREATE TABLE `taxInvoices` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`direction` text NOT NULL,
	`polarity` text NOT NULL,
	`type` text NOT NULL,
	`invoiceNo` text NOT NULL,
	`originalInvoiceNo` text DEFAULT '' NOT NULL,
	`counterparty` text NOT NULL,
	`date` text NOT NULL,
	`amountCents` integer NOT NULL,
	`taxCents` integer NOT NULL,
	`deduction` text DEFAULT 'pending' NOT NULL,
	`status` text NOT NULL,
	`reviewer` text DEFAULT '' NOT NULL,
	`note` text NOT NULL,
	`sourceId` text DEFAULT '' NOT NULL,
	`version` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tax_invoice_date` ON `taxInvoices` (`companyId`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tax_invoice_number` ON `taxInvoices` (`companyId`,`direction`,`invoiceNo`) WHERE status<>'void';--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tax_invoice_source` ON `taxInvoices` (`companyId`,`sourceId`) WHERE sourceId<>'' AND status<>'void';