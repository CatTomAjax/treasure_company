ALTER TABLE `treasure_agent_tasks` ADD `sortOrder` bigint AUTO_INCREMENT NOT NULL, ADD CONSTRAINT `treasure_agent_tasks_sortOrder_unique` UNIQUE(`sortOrder`);
