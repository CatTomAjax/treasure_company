CREATE TABLE `financeEntries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`direction` text NOT NULL,
	`category` text NOT NULL,
	`counterparty` text NOT NULL,
	`amountCents` integer NOT NULL,
	`taxBps` integer NOT NULL,
	`taxCents` integer NOT NULL,
	`invoiceNo` text NOT NULL,
	`note` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_finance_date` ON `financeEntries` (`date`);