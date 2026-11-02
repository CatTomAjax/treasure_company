export { database } from '../db/mysql';
import { database } from '../db/mysql';
import { seedTasks, seedFlows, seedKnowledge } from './workbench-data';
export async function initialize() {
  const db = database();
  if (
    await db
      .prepare('SELECT value FROM treasure_metadata WHERE `key` = ?')
      .bind('seeded')
      .first()
  )
    return;
  const ops = [
    ...seedTasks.map((t) =>
      db
        .prepare(
          'INSERT INTO treasure_tasks (id,title,type,brief,audience,channel,owner,status,content,createdAt,updatedAt,source,comment,dueDate) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`',
        )
        .bind(
          t.id,
          t.title,
          t.type,
          t.brief,
          t.audience,
          t.channel,
          t.owner,
          t.status,
          t.content,
          t.createdAt,
          t.updatedAt,
          t.source,
          t.comment,
          t.dueDate,
        ),
    ),
    ...seedKnowledge.map((k) =>
      db
        .prepare(
          'INSERT INTO treasure_knowledge (id,title,category,content,updatedAt) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`',
        )
        .bind(k.id, k.title, k.category, k.content, k.updatedAt),
    ),
    ...seedFlows.map((f) =>
      db
        .prepare(
          'INSERT INTO treasure_flows (id,title,description,type,enabled,runs) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE `id`=`id`',
        )
        .bind(f.id, f.title, f.description, f.type, f.enabled ? 1 : 0, f.runs),
    ),
    db
      .prepare(
        'INSERT INTO treasure_metadata (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE `key`=`key`',
      )
      .bind('seeded', '1'),
  ];
  await db.batch(ops);
}
export function event(taskId: string, message: string) {
  return database()
    .prepare(
      'INSERT INTO treasure_activities (id,taskId,message,createdAt) VALUES (?,?,?,?)',
    )
    .bind(crypto.randomUUID(), taskId, message, new Date().toISOString());
}
