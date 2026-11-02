CREATE TABLE treasure_transaction_lock (id int PRIMARY KEY) ENGINE=InnoDB;
--> statement-breakpoint
INSERT INTO treasure_transaction_lock(id) VALUES(1);
--> statement-breakpoint
CREATE TABLE treasure_data_imports (sourceHash char(64) PRIMARY KEY, importedAt varchar(32) NOT NULL, report longtext NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
--> statement-breakpoint
CREATE TRIGGER treasure_business_booking_overlap BEFORE UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF NEW.kind='booking' AND NEW.status='已确认' THEN
IF EXISTS(SELECT 1 FROM treasure_business_records r WHERE r.companyId=NEW.companyId AND r.kind='booking' AND r.status='已确认' AND r.id<>NEW.id AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.spaceId'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.spaceId')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.start'))<JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.end')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.end'))>JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.start'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='booking_overlap'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_lease_overlap BEFORE UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF NEW.kind='lease' AND NEW.status='已确认' THEN
IF EXISTS(SELECT 1 FROM treasure_business_records r WHERE r.companyId=NEW.companyId AND r.kind='lease' AND r.status='已确认' AND r.id<>NEW.id AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.spaceId'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.spaceId')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.startDate'))<=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.endDate')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.endDate'))>=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.startDate'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='lease_overlap'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_insert_audit AFTER INSERT ON treasure_business_records FOR EACH ROW BEGIN
IF COALESCE(@treasure_importing,0)=0 THEN
INSERT INTO treasure_business_history(id,companyId,recordId,actorId,actorName,action,snapshot,createdAt) VALUES(REPLACE(UUID(),'-',''),NEW.companyId,NEW.id,'system','系统','创建',json_object('title',NEW.title,'owner',NEW.owner,'status',NEW.status,'data',CAST(NEW.data AS JSON),'version',NEW.version),NEW.updatedAt);
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_update_audit AFTER UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF COALESCE(@treasure_importing,0)=0 THEN
INSERT INTO treasure_business_history(id,companyId,recordId,actorId,actorName,action,snapshot,createdAt) VALUES(REPLACE(UUID(),'-',''),NEW.companyId,NEW.id,'system','系统','版本更新',json_object('title',NEW.title,'owner',NEW.owner,'status',NEW.status,'data',CAST(NEW.data AS JSON),'version',NEW.version),NEW.updatedAt);
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_reading_overlap BEFORE UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF NEW.kind='reading' AND NEW.status='已确认' THEN
IF EXISTS(SELECT 1 FROM treasure_business_records r WHERE r.companyId=NEW.companyId AND r.kind='reading' AND r.status='已确认' AND r.id<>NEW.id AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.meterId'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.meterId')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.startDate'))<=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.endDate')) AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.endDate'))>=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.startDate'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='reading_overlap'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_receivable_limit BEFORE INSERT ON treasure_business_automations FOR EACH ROW BEGIN
IF NEW.action='bill.fromSource' AND EXISTS(SELECT 1 FROM treasure_business_records s WHERE s.id=NEW.sourceId AND s.kind IN ('acceptance','change')) THEN
IF (SELECT COALESCE(SUM(b.amountCents),0) FROM treasure_business_automations a JOIN treasure_business_records s ON s.id=a.sourceId JOIN treasure_finance_bills b ON b.id=a.targetId WHERE a.companyId=NEW.companyId AND a.action='bill.fromSource' AND s.kind IN ('acceptance','change') AND JSON_UNQUOTE(JSON_EXTRACT(s.data,'$.projectId'))=(SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.projectId')) FROM treasure_business_records WHERE id=NEW.sourceId) AND b.status<>'void')+(SELECT amountCents FROM treasure_finance_bills WHERE id=NEW.targetId)>
 (SELECT CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED)+COALESCE((SELECT SUM(CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(c.data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED)) FROM treasure_business_records c WHERE c.companyId=NEW.companyId AND c.kind='change' AND c.status='已确认' AND JSON_UNQUOTE(JSON_EXTRACT(c.data,'$.projectId'))=p.id),0) FROM treasure_business_records p WHERE p.id=(SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.projectId')) FROM treasure_business_records WHERE id=NEW.sourceId)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receivable_limit'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_business_meter_lock BEFORE UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF NEW.kind='meter' AND (JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.price'))<>JSON_UNQUOTE(JSON_EXTRACT(OLD.data,'$.price')) OR JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.spaceId'))<>JSON_UNQUOTE(JSON_EXTRACT(OLD.data,'$.spaceId'))) THEN
IF EXISTS(SELECT 1 FROM treasure_business_records r WHERE r.companyId=NEW.companyId AND r.kind='reading' AND r.status IN ('已确认','已归档') AND JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.meterId'))=NEW.id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='meter_in_use'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_collection_plan_limit BEFORE UPDATE ON treasure_business_records FOR EACH ROW BEGIN
IF NEW.kind='collectionPlan' AND NEW.status IN ('已确认','已归档') THEN
IF (SELECT COALESCE(SUM(CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED)),0) FROM treasure_business_records WHERE companyId=NEW.companyId AND kind='collectionPlan' AND id<>NEW.id AND status IN ('已确认','已归档') AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId'))=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.orderId')))+CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED)>(SELECT CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED) FROM treasure_business_records WHERE id=JSON_UNQUOTE(JSON_EXTRACT(NEW.data,'$.orderId'))) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='collection_plan_limit'; END IF;
END IF;
END;
--> statement-breakpoint
CREATE TRIGGER treasure_collection_bill_limit BEFORE INSERT ON treasure_business_automations FOR EACH ROW BEGIN
IF NEW.action='collectionPlan.bill' THEN
IF (SELECT COALESCE(SUM(f.amountCents),0) FROM treasure_business_automations a JOIN treasure_business_records p ON p.id=a.sourceId JOIN treasure_finance_bills f ON f.id=a.targetId WHERE a.companyId=NEW.companyId AND a.action='collectionPlan.bill' AND JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.orderId'))=(SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId')) FROM treasure_business_records WHERE id=NEW.sourceId) AND f.status<>'void')+(SELECT amountCents FROM treasure_finance_bills WHERE id=NEW.targetId)>(SELECT CAST(ROUND(CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.amount')) AS DECIMAL(30,6))*100) AS SIGNED) FROM treasure_business_records WHERE id=(SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.orderId')) FROM treasure_business_records WHERE id=NEW.sourceId)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='collection_plan_limit'; END IF;
END IF;
END;
