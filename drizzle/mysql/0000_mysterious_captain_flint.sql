CREATE TABLE `treasure_activities` (
	`id` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL,
	`message` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_activities_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_events` (
	`seq` bigint AUTO_INCREMENT NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`runId` varchar(191) NOT NULL,
	`taskId` varchar(191) NOT NULL DEFAULT '',
	`generation` bigint NOT NULL,
	`type` varchar(191) NOT NULL,
	`actor` varchar(191) NOT NULL,
	`content` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_agent_events_seq` PRIMARY KEY(`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_jobs` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`runId` varchar(191) NOT NULL,
	`generation` bigint NOT NULL,
	`status` varchar(191) NOT NULL,
	`requestedBy` varchar(191) NOT NULL,
	`attempts` bigint NOT NULL DEFAULT 0,
	`availableAt` varchar(191) NOT NULL,
	`owner` varchar(191) NOT NULL DEFAULT '',
	`token` varchar(191) NOT NULL DEFAULT '',
	`lastError` longtext NOT NULL DEFAULT (''),
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_agent_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_job_generation` UNIQUE(`companyId`,`runId`,`generation`),
	CONSTRAINT `treasure_agent_job_status` CHECK(`treasure_agent_jobs`.`status` IN ('queued','running','retry_wait','done','paused','cancelled','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_policies` (
	`companyId` varchar(191) NOT NULL,
	`projectId` varchar(191) NOT NULL DEFAULT '',
	`config` longtext NOT NULL,
	`version` bigint NOT NULL DEFAULT 1,
	`updatedBy` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_agent_policies_companyId_projectId_pk` PRIMARY KEY(`companyId`,`projectId`),
	CONSTRAINT `treasure_agent_policy_json` CHECK(json_valid(`treasure_agent_policies`.`config`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_runs` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`projectId` varchar(191) NOT NULL DEFAULT '',
	`sceneId` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`goal` longtext NOT NULL,
	`input` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`version` bigint NOT NULL DEFAULT 1,
	`generation` bigint NOT NULL DEFAULT 1,
	`policy` longtext NOT NULL,
	`snapshot` longtext NOT NULL,
	`directives` longtext NOT NULL DEFAULT ('[]'),
	`summary` longtext NOT NULL DEFAULT (''),
	`checks` longtext NOT NULL DEFAULT (''),
	`sensitive` bigint NOT NULL DEFAULT 0,
	`createdBy` varchar(191) NOT NULL,
	`approvedBy` varchar(191) NOT NULL DEFAULT '',
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`leaseToken` varchar(191) NOT NULL DEFAULT '',
	`leaseUntil` varchar(191) NOT NULL DEFAULT '',
	`controlToken` varchar(191) NOT NULL DEFAULT '',
	`authorization` longtext NOT NULL DEFAULT ('null'),
	CONSTRAINT `treasure_agent_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_runs_company_id` UNIQUE(`companyId`,`id`),
	CONSTRAINT `treasure_agent_run_status` CHECK(`treasure_agent_runs`.`status` IN ('queued','running','paused','checking','awaiting_review','approved','failed','cancelled')),
	CONSTRAINT `treasure_agent_run_policy` CHECK(json_valid(`treasure_agent_runs`.`policy`)),
	CONSTRAINT `treasure_agent_run_snapshot` CHECK(json_valid(`treasure_agent_runs`.`snapshot`)),
	CONSTRAINT `treasure_agent_run_directives` CHECK(json_valid(`treasure_agent_runs`.`directives`)),
	CONSTRAINT `treasure_agent_run_authorization` CHECK(json_valid(`treasure_agent_runs`.`authorization`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_slots` (
	`id` bigint NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`runId` varchar(191) NOT NULL,
	`token` varchar(191) NOT NULL,
	`expiresAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_agent_slots_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_tasks` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`runId` varchar(191) NOT NULL,
	`spec` longtext NOT NULL,
	`status` varchar(191) NOT NULL DEFAULT 'pending',
	`content` longtext NOT NULL DEFAULT (''),
	`sources` longtext NOT NULL DEFAULT ('[]'),
	`provider` varchar(191) NOT NULL DEFAULT '',
	`inputTokens` bigint NOT NULL DEFAULT 0,
	`outputTokens` bigint NOT NULL DEFAULT 0,
	`attempt` bigint NOT NULL DEFAULT 0,
	`generation` bigint NOT NULL DEFAULT 1,
	`error` longtext NOT NULL DEFAULT (''),
	`startedAt` varchar(191) NOT NULL DEFAULT '',
	`finishedAt` varchar(191) NOT NULL DEFAULT '',
	CONSTRAINT `treasure_agent_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_tasks_run_id` UNIQUE(`runId`,`id`),
	CONSTRAINT `treasure_agent_task_spec` CHECK(json_valid(`treasure_agent_tasks`.`spec`)),
	CONSTRAINT `treasure_agent_task_sources` CHECK(json_valid(`treasure_agent_tasks`.`sources`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_agent_workers` (
	`id` varchar(191) NOT NULL,
	`owner` varchar(191) NOT NULL,
	`heartbeatAt` varchar(191) NOT NULL,
	`leaseUntil` varchar(191) NOT NULL,
	CONSTRAINT `treasure_agent_workers_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_ai_locks` (
	`runId` varchar(191) NOT NULL,
	`token` varchar(191) NOT NULL,
	`expiresAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_ai_locks_runId` PRIMARY KEY(`runId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_ai_steps` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`runId` varchar(191) NOT NULL,
	`step` bigint NOT NULL,
	`roleId` varchar(191) NOT NULL,
	`content` longtext NOT NULL,
	`sources` longtext NOT NULL,
	`provider` varchar(191) NOT NULL,
	`inputTokens` bigint NOT NULL DEFAULT 0,
	`outputTokens` bigint NOT NULL DEFAULT 0,
	`status` varchar(191) NOT NULL,
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_ai_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_ai_step_unique` UNIQUE(`runId`,`step`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_automations` (
	`companyId` varchar(191) NOT NULL,
	`sourceId` varchar(191) NOT NULL,
	`action` varchar(191) NOT NULL,
	`targetId` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_automations_sourceId_action_pk` PRIMARY KEY(`sourceId`,`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_file_chunks` (
	`fileId` varchar(191) NOT NULL,
	`part` bigint NOT NULL,
	`data` longtext NOT NULL,
	CONSTRAINT `treasure_business_file_chunks_fileId_part_pk` PRIMARY KEY(`fileId`,`part`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_files` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`mime` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`size` bigint NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_files_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_history` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`actorId` varchar(191) NOT NULL,
	`actorName` varchar(191) NOT NULL,
	`action` varchar(191) NOT NULL,
	`snapshot` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `treasure_business_snapshot_json` CHECK(json_valid(`treasure_business_history`.`snapshot`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_import_batches` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_import_batches_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_notice_inbox` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`noticeId` varchar(191) NOT NULL,
	`senderCompanyId` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`content` longtext NOT NULL,
	`status` varchar(191) NOT NULL DEFAULT '未读',
	`response` varchar(191) NOT NULL DEFAULT '',
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_notice_inbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_inbox_unique` UNIQUE(`companyId`,`noticeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_records` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`owner` varchar(191) NOT NULL,
	`dueDate` varchar(191) NOT NULL DEFAULT '',
	`status` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`meterSerial` varchar(191) GENERATED ALWAYS AS (CASE WHEN kind='meter' AND JSON_TYPE(JSON_EXTRACT(data,'$.serial'))<>'NULL' THEN JSON_UNQUOTE(JSON_EXTRACT(data,'$.serial')) ELSE NULL END) VIRTUAL,
	CONSTRAINT `treasure_business_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_tenant_id` UNIQUE(`companyId`,`id`),
	CONSTRAINT `idx_meter_serial` UNIQUE(`companyId`,`meterSerial`),
	CONSTRAINT `treasure_business_data_json` CHECK(json_valid(`treasure_business_records`.`data`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_business_relations` (
	`companyId` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`field` varchar(191) NOT NULL,
	`targetId` varchar(191) NOT NULL,
	CONSTRAINT `treasure_business_relations_recordId_field_pk` PRIMARY KEY(`recordId`,`field`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_accounts` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(191) NOT NULL,
	`openingCents` bigint NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_finance_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_finance_account_name` UNIQUE(`companyId`,`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_audit` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`billId` varchar(191) NOT NULL,
	`message` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_finance_audit_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_bills` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`counterparty` varchar(191) NOT NULL,
	`category` varchar(191) NOT NULL,
	`date` varchar(191) NOT NULL,
	`dueDate` varchar(191) NOT NULL,
	`amountCents` bigint NOT NULL,
	`paidCents` bigint NOT NULL DEFAULT 0,
	`taxBps` bigint NOT NULL,
	`invoiceNo` varchar(191) NOT NULL,
	`note` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`reviewNote` longtext NOT NULL DEFAULT (''),
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`version` varchar(191) NOT NULL,
	`activeInvoiceNo` varchar(191) GENERATED ALWAYS AS (CASE WHEN invoiceNo<>'' AND status<>'void' THEN invoiceNo ELSE NULL END) VIRTUAL,
	CONSTRAINT `treasure_finance_bills_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_finance_bill_invoice` UNIQUE(`companyId`,`kind`,`activeInvoiceNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_companies` (
	`id` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_finance_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_finance_company_name` UNIQUE(`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_documents` (
	`billId` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`mime` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	CONSTRAINT `treasure_finance_documents_billId` PRIMARY KEY(`billId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_entries` (
	`id` varchar(191) NOT NULL,
	`date` varchar(191) NOT NULL,
	`direction` varchar(191) NOT NULL,
	`category` varchar(191) NOT NULL,
	`counterparty` varchar(191) NOT NULL,
	`amountCents` bigint NOT NULL,
	`taxBps` bigint NOT NULL,
	`taxCents` bigint NOT NULL,
	`invoiceNo` varchar(191) NOT NULL,
	`note` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL DEFAULT 'park',
	`accountId` varchar(191),
	`paymentId` varchar(191),
	`activeInvoiceNo` varchar(191) GENERATED ALWAYS AS (CASE WHEN invoiceNo<>'' AND status<>'void' AND paymentId IS NULL THEN invoiceNo ELSE NULL END) VIRTUAL,
	CONSTRAINT `treasure_finance_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_finance_payment_entry` UNIQUE(`paymentId`),
	CONSTRAINT `idx_finance_entry_invoice` UNIQUE(`companyId`,`direction`,`activeInvoiceNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_finance_payments` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`billId` varchar(191) NOT NULL,
	`accountId` varchar(191) NOT NULL,
	`amountCents` bigint NOT NULL,
	`date` varchar(191) NOT NULL,
	`reference` varchar(191) NOT NULL,
	`note` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_finance_payments_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_flows` (
	`id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`description` longtext NOT NULL,
	`type` varchar(191) NOT NULL,
	`enabled` boolean NOT NULL,
	`runs` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `treasure_flows_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_callbacks` (
	`connectionId` varchar(191) NOT NULL,
	`eventId` varchar(191) NOT NULL,
	`payloadHash` varchar(191) NOT NULL,
	`receivedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_integration_callbacks_connectionId_eventId_pk` PRIMARY KEY(`connectionId`,`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_connections` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`provider` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`config` longtext NOT NULL,
	`enabled` bigint NOT NULL DEFAULT 0,
	`testStatus` varchar(191) NOT NULL DEFAULT 'not_tested',
	`testMessage` longtext NOT NULL DEFAULT (''),
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_integration_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `treasure_integration_config_json` CHECK(json_valid(`treasure_integration_connections`.`config`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_events` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`connectionId` varchar(191) NOT NULL,
	`jobId` varchar(191) NOT NULL DEFAULT '',
	`actor` varchar(191) NOT NULL,
	`message` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_integration_events_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_jobs` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`connectionId` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`recordVersion` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`payload` longtext NOT NULL,
	`result` longtext NOT NULL,
	`attempts` bigint NOT NULL DEFAULT 0,
	`maxAttempts` bigint NOT NULL DEFAULT 3,
	`nextRetryAt` varchar(191) NOT NULL DEFAULT '',
	`remoteId` varchar(191) NOT NULL DEFAULT '',
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_integration_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `treasure_integration_payload_json` CHECK(json_valid(`treasure_integration_jobs`.`payload`)),
	CONSTRAINT `treasure_integration_result_json` CHECK(json_valid(`treasure_integration_jobs`.`result`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_secrets` (
	`connectionId` varchar(191) NOT NULL,
	`field` varchar(191) NOT NULL,
	`nonce` varchar(191) NOT NULL,
	`ciphertext` longtext NOT NULL,
	CONSTRAINT `treasure_integration_secrets_connectionId_field_pk` PRIMARY KEY(`connectionId`,`field`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_integration_usage` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`connectionId` varchar(191) NOT NULL,
	`model` varchar(191) NOT NULL,
	`inputTokens` bigint NOT NULL,
	`outputTokens` bigint NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_integration_usage_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_knowledge` (
	`id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`category` varchar(191) NOT NULL,
	`content` longtext NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_knowledge_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_knowledge_imports` (
	`companyId` varchar(191) NOT NULL,
	`hash` varchar(191) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`count` bigint NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_knowledge_imports_companyId_hash_pk` PRIMARY KEY(`companyId`,`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_metadata` (
	`key` varchar(191) NOT NULL,
	`value` longtext NOT NULL,
	CONSTRAINT `treasure_metadata_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_model_catalogs` (
	`connectionId` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`models` longtext NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_model_catalogs_connectionId` PRIMARY KEY(`connectionId`),
	CONSTRAINT `treasure_model_catalog_json` CHECK(json_valid(`treasure_model_catalogs`.`models`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_model_preferences` (
	`companyId` varchar(191) NOT NULL,
	`projectId` varchar(191) NOT NULL DEFAULT '',
	`connectionId` varchar(191) NOT NULL,
	`model` varchar(191) NOT NULL,
	`version` bigint NOT NULL DEFAULT 1,
	`updatedBy` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_model_preferences_companyId_projectId_pk` PRIMARY KEY(`companyId`,`projectId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_model_tests` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`connectionId` varchar(191) NOT NULL,
	`connectionVersion` varchar(191) NOT NULL,
	`model` varchar(191) NOT NULL,
	`kind` varchar(191) NOT NULL,
	`status` varchar(191) NOT NULL,
	`latencyMs` bigint NOT NULL,
	`inputTokens` bigint NOT NULL DEFAULT 0,
	`outputTokens` bigint NOT NULL DEFAULT 0,
	`message` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`actor` varchar(191) NOT NULL,
	CONSTRAINT `treasure_model_tests_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_platform_login_attempts` (
	`key` varchar(191) NOT NULL,
	`attempts` bigint NOT NULL,
	`expiresAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_platform_login_attempts_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_platform_members` (
	`userId` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`role` varchar(191) NOT NULL,
	CONSTRAINT `treasure_platform_members_userId_companyId_pk` PRIMARY KEY(`userId`,`companyId`),
	CONSTRAINT `treasure_platform_role_check` CHECK(`treasure_platform_members`.`role` IN ('admin','manager','member','viewer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_platform_sessions` (
	`tokenHash` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`expiresAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_platform_sessions_tokenHash` PRIMARY KEY(`tokenHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_platform_users` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`salt` varchar(191) NOT NULL,
	`passwordHash` varchar(191) NOT NULL,
	`isAdmin` bigint NOT NULL DEFAULT 0,
	`active` bigint NOT NULL DEFAULT 1,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_platform_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `treasure_platform_users_email_unique` UNIQUE(`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_ppt_files` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`mime` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_ppt_files_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_ppt_workspaces` (
	`companyId` varchar(191) NOT NULL,
	`state` longtext NOT NULL,
	`version` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_ppt_workspaces_companyId` PRIMARY KEY(`companyId`),
	CONSTRAINT `treasure_ppt_state_json` CHECK(json_valid(`treasure_ppt_workspaces`.`state`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_service_tickets` (
	`id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`location` varchar(191) NOT NULL,
	`category` varchar(191) NOT NULL,
	`priority` varchar(191) NOT NULL,
	`reporter` varchar(191) NOT NULL,
	`description` longtext NOT NULL,
	`status` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	CONSTRAINT `treasure_service_tickets_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_tasks` (
	`id` varchar(191) NOT NULL,
	`title` longtext NOT NULL,
	`type` varchar(191) NOT NULL,
	`brief` longtext NOT NULL,
	`audience` longtext NOT NULL,
	`channel` varchar(191) NOT NULL,
	`owner` varchar(191) NOT NULL,
	`status` varchar(191) NOT NULL,
	`content` longtext NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`source` longtext NOT NULL,
	`comment` longtext NOT NULL,
	`dueDate` varchar(191) NOT NULL,
	CONSTRAINT `treasure_tasks_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_tax_documents` (
	`invoiceId` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`mime` varchar(191) NOT NULL,
	`data` longtext NOT NULL,
	CONSTRAINT `treasure_tax_documents_invoiceId` PRIMARY KEY(`invoiceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_tax_filings` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`taxType` varchar(191) NOT NULL,
	`periodStart` varchar(191) NOT NULL,
	`periodEnd` varchar(191) NOT NULL,
	`deadline` varchar(191) NOT NULL,
	`owner` varchar(191) NOT NULL,
	`amountCents` bigint NOT NULL,
	`status` varchar(191) NOT NULL,
	`filingNo` varchar(191) NOT NULL DEFAULT '',
	`filedDate` varchar(191) NOT NULL DEFAULT '',
	`paymentReference` varchar(191) NOT NULL DEFAULT '',
	`paidDate` varchar(191) NOT NULL DEFAULT '',
	`note` longtext NOT NULL,
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`activeRecord` bigint GENERATED ALWAYS AS (CASE WHEN status<>'void' THEN 1 ELSE NULL END) VIRTUAL,
	CONSTRAINT `treasure_tax_filings_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_tax_filing_period` UNIQUE(`companyId`,`taxType`,`periodStart`,`periodEnd`,`activeRecord`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TABLE `treasure_tax_invoices` (
	`id` varchar(191) NOT NULL,
	`companyId` varchar(191) NOT NULL,
	`direction` varchar(191) NOT NULL,
	`polarity` varchar(191) NOT NULL,
	`type` varchar(191) NOT NULL,
	`invoiceNo` varchar(191) NOT NULL,
	`originalInvoiceNo` varchar(191) NOT NULL DEFAULT '',
	`counterparty` varchar(191) NOT NULL,
	`date` varchar(191) NOT NULL,
	`amountCents` bigint NOT NULL,
	`taxCents` bigint NOT NULL,
	`deduction` varchar(191) NOT NULL DEFAULT 'pending',
	`status` varchar(191) NOT NULL,
	`reviewer` varchar(191) NOT NULL DEFAULT '',
	`note` longtext NOT NULL,
	`sourceId` varchar(191) NOT NULL DEFAULT '',
	`version` varchar(191) NOT NULL,
	`createdAt` varchar(191) NOT NULL,
	`updatedAt` varchar(191) NOT NULL,
	`activeInvoiceNo` varchar(191) GENERATED ALWAYS AS (CASE WHEN status<>'void' THEN invoiceNo ELSE NULL END) VIRTUAL,
	`activeSourceId` varchar(191) GENERATED ALWAYS AS (CASE WHEN sourceId<>'' AND status<>'void' THEN sourceId ELSE NULL END) VIRTUAL,
	CONSTRAINT `treasure_tax_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_tax_invoice_number` UNIQUE(`companyId`,`direction`,`activeInvoiceNo`),
	CONSTRAINT `idx_tax_invoice_source` UNIQUE(`companyId`,`activeSourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
ALTER TABLE `treasure_agent_events` ADD CONSTRAINT `treasure_agent_events_companyId_runId_treasure_agen_cf705cf2dd` FOREIGN KEY (`companyId`,`runId`) REFERENCES `treasure_agent_runs`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_agent_jobs` ADD CONSTRAINT `treasure_agent_jobs_requestedBy_treasure_platform_users_id_fk` FOREIGN KEY (`requestedBy`) REFERENCES `treasure_platform_users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_agent_jobs` ADD CONSTRAINT `treasure_agent_jobs_companyId_runId_treasure_agent__eae4e5e6d8` FOREIGN KEY (`companyId`,`runId`) REFERENCES `treasure_agent_runs`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_agent_policies` ADD CONSTRAINT `treasure_agent_policies_companyId_treasure_financ_f0ac28144c` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_agent_runs` ADD CONSTRAINT `treasure_agent_runs_companyId_treasure_finance_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_agent_tasks` ADD CONSTRAINT `treasure_agent_tasks_companyId_runId_treasure_agent_c7f6e7e03d` FOREIGN KEY (`companyId`,`runId`) REFERENCES `treasure_agent_runs`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_ai_steps` ADD CONSTRAINT `treasure_business_ai_steps_companyId_runId_treasure_839c31f05d` FOREIGN KEY (`companyId`,`runId`) REFERENCES `treasure_business_records`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_file_chunks` ADD CONSTRAINT `treasure_business_file_chunks_fileId_treasure_bus_311b998880` FOREIGN KEY (`fileId`) REFERENCES `treasure_business_files`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_files` ADD CONSTRAINT `treasure_business_files_companyId_recordId_treasure_7720052b46` FOREIGN KEY (`companyId`,`recordId`) REFERENCES `treasure_business_records`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_records` ADD CONSTRAINT `treasure_business_records_companyId_treasure_financ_45f17088cd` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_relations` ADD CONSTRAINT `treasure_business_relations_companyId_recordId_con_202057cef7` FOREIGN KEY (`companyId`,`recordId`) REFERENCES `treasure_business_records`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_business_relations` ADD CONSTRAINT `treasure_business_relations_companyId_targetId_con_d56cd12b70` FOREIGN KEY (`companyId`,`targetId`) REFERENCES `treasure_business_records`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_integration_connections` ADD CONSTRAINT `treasure_integration_connections_companyId_treasure_8d33347df6` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_integration_jobs` ADD CONSTRAINT `treasure_integration_jobs_connectionId_treasure_int_a2421b6276` FOREIGN KEY (`connectionId`) REFERENCES `treasure_integration_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_integration_jobs` ADD CONSTRAINT `treasure_integration_jobs_companyId_recordId_conso_ff1776e889` FOREIGN KEY (`companyId`,`recordId`) REFERENCES `treasure_business_records`(`companyId`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_integration_secrets` ADD CONSTRAINT `treasure_integration_secrets_connectionId_treasure__8b4b0a5c2b` FOREIGN KEY (`connectionId`) REFERENCES `treasure_integration_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_catalogs` ADD CONSTRAINT `treasure_model_catalogs_connectionId_treasure_integ_b58f68ab2e` FOREIGN KEY (`connectionId`) REFERENCES `treasure_integration_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_catalogs` ADD CONSTRAINT `treasure_model_catalogs_companyId_treasure_financ_614b6ddfb4` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_preferences` ADD CONSTRAINT `treasure_model_preferences_companyId_treasure_finan_58021201e6` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_preferences` ADD CONSTRAINT `treasure_model_preferences_connectionId_treasure_in_cb352190cb` FOREIGN KEY (`connectionId`) REFERENCES `treasure_integration_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_tests` ADD CONSTRAINT `treasure_model_tests_companyId_treasure_finance_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_model_tests` ADD CONSTRAINT `treasure_model_tests_connectionId_treasure_integrat_7ef1933bf3` FOREIGN KEY (`connectionId`) REFERENCES `treasure_integration_connections`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_platform_members` ADD CONSTRAINT `treasure_platform_members_userId_treasure_platform_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `treasure_platform_users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_platform_members` ADD CONSTRAINT `treasure_platform_members_companyId_treasure_financ_cf5a542883` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_platform_sessions` ADD CONSTRAINT `treasure_platform_sessions_userId_treasure_platform_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `treasure_platform_users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_ppt_files` ADD CONSTRAINT `treasure_ppt_files_companyId_treasure_finance_companies_id_fk` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `treasure_ppt_workspaces` ADD CONSTRAINT `treasure_ppt_workspaces_companyId_treasure_financ_2a8bd92d43` FOREIGN KEY (`companyId`) REFERENCES `treasure_finance_companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_activities_created` ON `treasure_activities` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_agent_events_replay` ON `treasure_agent_events` (`companyId`,`runId`,`seq`);--> statement-breakpoint
CREATE INDEX `agent_job_queue` ON `treasure_agent_jobs` (`status`,`availableAt`);--> statement-breakpoint
CREATE INDEX `idx_agent_runs_company` ON `treasure_agent_runs` (`companyId`,`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_agent_slots_tenant` ON `treasure_agent_slots` (`companyId`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_agent_tasks_run` ON `treasure_agent_tasks` (`companyId`,`runId`);--> statement-breakpoint
CREATE INDEX `idx_business_history` ON `treasure_business_history` (`companyId`,`recordId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_business_tenant_kind` ON `treasure_business_records` (`companyId`,`kind`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_business_due` ON `treasure_business_records` (`companyId`,`dueDate`,`status`);--> statement-breakpoint
CREATE INDEX `idx_finance_company_bills` ON `treasure_finance_bills` (`companyId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_finance_date` ON `treasure_finance_entries` (`date`);--> statement-breakpoint
CREATE INDEX `idx_finance_company_entries` ON `treasure_finance_entries` (`companyId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_finance_company_payments` ON `treasure_finance_payments` (`companyId`,`date`);--> statement-breakpoint
CREATE INDEX `idx_connections_company` ON `treasure_integration_connections` (`companyId`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_jobs_company` ON `treasure_integration_jobs` (`companyId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_model_tests` ON `treasure_model_tests` (`companyId`,`connectionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_ppt_files_company` ON `treasure_ppt_files` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_service_tickets_created` ON `treasure_service_tickets` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_tasks_updated` ON `treasure_tasks` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_tax_filing_due` ON `treasure_tax_filings` (`companyId`,`deadline`);--> statement-breakpoint
CREATE INDEX `idx_tax_invoice_date` ON `treasure_tax_invoices` (`companyId`,`date`);