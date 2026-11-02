CREATE TRIGGER business_reading_overlap BEFORE UPDATE ON businessRecords WHEN NEW.kind='reading' AND NEW.status='已确认' BEGIN
 SELECT RAISE(ABORT,'reading_overlap') WHERE EXISTS(SELECT 1 FROM businessRecords r WHERE r.companyId=NEW.companyId AND r.kind='reading' AND r.status='已确认' AND r.id<>NEW.id AND json_extract(r.data,'$.meterId')=json_extract(NEW.data,'$.meterId') AND json_extract(r.data,'$.startDate')<=json_extract(NEW.data,'$.endDate') AND json_extract(r.data,'$.endDate')>=json_extract(NEW.data,'$.startDate'));
END;
--> statement-breakpoint
CREATE TRIGGER business_receivable_limit BEFORE INSERT ON businessAutomations WHEN NEW.action='bill.fromSource' AND EXISTS(SELECT 1 FROM businessRecords s WHERE s.id=NEW.sourceId AND s.kind IN ('acceptance','change')) BEGIN
 SELECT RAISE(ABORT,'receivable_limit') WHERE
 (SELECT COALESCE(SUM(b.amountCents),0) FROM businessAutomations a JOIN businessRecords s ON s.id=a.sourceId JOIN financeBills b ON b.id=a.targetId WHERE a.companyId=NEW.companyId AND a.action='bill.fromSource' AND s.kind IN ('acceptance','change') AND json_extract(s.data,'$.projectId')=(SELECT json_extract(data,'$.projectId') FROM businessRecords WHERE id=NEW.sourceId) AND b.status<>'void')+(SELECT amountCents FROM financeBills WHERE id=NEW.targetId)>
 (SELECT CAST(ROUND(CAST(json_extract(p.data,'$.amount') AS REAL)*100) AS INTEGER)+COALESCE((SELECT SUM(CAST(ROUND(CAST(json_extract(c.data,'$.amount') AS REAL)*100) AS INTEGER)) FROM businessRecords c WHERE c.companyId=NEW.companyId AND c.kind='change' AND c.status='已确认' AND json_extract(c.data,'$.projectId')=p.id),0) FROM businessRecords p WHERE p.id=(SELECT json_extract(data,'$.projectId') FROM businessRecords WHERE id=NEW.sourceId));
END;
--> statement-breakpoint
CREATE TRIGGER business_meter_lock BEFORE UPDATE ON businessRecords WHEN NEW.kind='meter' AND (json_extract(NEW.data,'$.price')<>json_extract(OLD.data,'$.price') OR json_extract(NEW.data,'$.spaceId')<>json_extract(OLD.data,'$.spaceId')) BEGIN
 SELECT RAISE(ABORT,'meter_in_use') WHERE EXISTS(SELECT 1 FROM businessRecords r WHERE r.companyId=NEW.companyId AND r.kind='reading' AND r.status IN ('已确认','已归档') AND json_extract(r.data,'$.meterId')=NEW.id);
END;
