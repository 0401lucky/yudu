/** R2 对象键与读写封装 */

export const r2Key = {
  source(userId: string, bookId: string, filename: string): string {
    const safe = sanitizeFilename(filename);
    return `users/${userId}/books/${bookId}/source/${safe}`;
  },
  chapter(userId: string, bookId: string, idx: number): string {
    return `users/${userId}/books/${bookId}/chapters/${idx}.json`;
  },
  cover(userId: string, bookId: string): string {
    return `users/${userId}/books/${bookId}/cover`;
  },
  bookPrefix(userId: string, bookId: string): string {
    return `users/${userId}/books/${bookId}/`;
  },
};

/** 去掉路径分量，避免遍历；保留中文与常见安全字符 */
function sanitizeFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "").trim();
  const cleaned = base.replace(/[^\w.\u4e00-\u9fff\-()+@]+/g, "_");
  return cleaned || "source.bin";
}

export async function putText(
  bucket: R2Bucket,
  key: string,
  text: string,
  contentType = "application/json; charset=utf-8",
): Promise<void> {
  await bucket.put(key, text, {
    httpMetadata: { contentType },
  });
}

export async function getText(
  bucket: R2Bucket,
  key: string,
): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.text();
}

export async function putBytes(
  bucket: R2Bucket,
  key: string,
  bytes: ArrayBuffer | ArrayBufferView | string,
  contentType: string,
): Promise<void> {
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
  });
}

export async function getObject(
  bucket: R2Bucket,
  key: string,
): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

/** 列出前缀下所有对象并删除（分页） */
export async function deletePrefix(
  bucket: R2Bucket,
  prefix: string,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length > 0) {
      await Promise.all(listed.objects.map((o) => bucket.delete(o.key)));
    }
    if (!listed.truncated) break;
    cursor = listed.cursor;
  }
}
