import { database } from './store';
import { PlatformError } from './platform-auth';
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export function fileOps(
  companyId: string,
  recordId: string,
  name: string,
  mime: string,
  encoded: string,
) {
  const db = database(),
    id = crypto.randomUUID(),
    size =
      Math.floor((encoded.length * 3) / 4) -
      (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (size < 1 || size > MAX_FILE_BYTES)
    throw new PlatformError('单文件须为1字节至8 MB');
  const ops = [
    db
      .prepare(
        "INSERT INTO treasure_business_files(id,companyId,recordId,name,mime,data,size,createdAt) VALUES(?,?,?,?,?,'',?,?)",
      )
      .bind(
        id,
        companyId,
        recordId,
        name,
        mime,
        size,
        new Date().toISOString(),
      ),
  ];
  for (let i = 0; i < encoded.length; i += 700000)
    ops.push(
      db
        .prepare(
          "INSERT INTO treasure_business_file_chunks(fileId,part,data) VALUES(?,?,?)",
        )
        .bind(id, i / 700000, encoded.slice(i, i + 700000)),
    );
  return { id, ops, size };
}
export async function fileData(companyId: string, id: string) {
  const file = await database()
    .prepare("SELECT * FROM treasure_business_files WHERE id=? AND companyId=?")
    .bind(id, companyId)
    .first<{
      id: string;
      recordId: string;
      name: string;
      mime: string;
      data: string;
      size: number;
    }>();
  if (!file) throw new PlatformError('文件不存在', 404);
  if (!file.data) {
    const parts = (
      await database()
        .prepare(
          "SELECT data,part FROM treasure_business_file_chunks WHERE fileId=? ORDER BY part",
        )
        .bind(id)
        .all<{ data: string; part: number }>()
    ).results;
    if (parts.some((p, i) => p.part !== i))
      throw new PlatformError('文件分片不完整', 503);
    file.data = parts.map((p) => p.data).join('');
  }
  return file;
}
export function encodeBytes(bytes: Uint8Array) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768)
    result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
