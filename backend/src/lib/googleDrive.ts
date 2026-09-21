import { decryptSecret } from "./secretBox";
import type { Env } from "../types";

interface DriveOAuthRow {
  google_email: string;
  refresh_token_enc: string;
  folder_id: string;
}

export async function getDriveOAuthRow(db: D1Database): Promise<DriveOAuthRow | null> {
  return db
    .prepare("SELECT google_email, refresh_token_enc, folder_id FROM google_drive_oauth WHERE id = 1")
    .first<DriveOAuthRow>();
}

async function getAccessToken(env: Env, refreshTokenEnc: string): Promise<string> {
  const refreshToken = await decryptSecret(refreshTokenEnc, env.SESSION_SECRET);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`DRIVE_REFRESH_FAILED: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// Drive API KHONG nhan multipart/form-data chuan cua FormData - phai tu dung boundary theo RFC 2387
// (metadata JSON + noi dung file, phan cach boi "--<boundary>").
function buildMultipartBody(
  metadata: Record<string, unknown>,
  bytes: Uint8Array,
  mimeType: string,
  boundary: string,
): Uint8Array {
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return body;
}

// Upload 1 file (anh hoac video, Drive khong phan biet) len folder rieng cua app, cap quyen doc
// cong khai (anyone-with-link), tra ve link thumbnail xem THANG duoc (khong can dang nhap Google).
export async function uploadPublicFile(
  env: Env,
  db: D1Database,
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<{ driveFileId: string; url: string }> {
  const oauth = await getDriveOAuthRow(db);
  if (!oauth) throw new Error("DRIVE_NOT_CONNECTED");
  const accessToken = await getAccessToken(env, oauth.refresh_token_enc);

  const boundary = `khieunai_${crypto.randomUUID()}`;
  const body = buildMultipartBody({ name: filename, parents: [oauth.folder_id] }, bytes, mimeType, boundary);
  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!uploadRes.ok) throw new Error(`DRIVE_UPLOAD_FAILED: ${uploadRes.status} ${await uploadRes.text()}`);
  const { id: driveFileId } = (await uploadRes.json()) as { id: string };

  const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (!permRes.ok) throw new Error(`DRIVE_PERMISSION_FAILED: ${permRes.status} ${await permRes.text()}`);

  return { driveFileId, url: `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w1000` };
}

export async function deletePublicFile(env: Env, db: D1Database, driveFileId: string): Promise<void> {
  const oauth = await getDriveOAuthRow(db);
  if (!oauth) throw new Error("DRIVE_NOT_CONNECTED");
  const accessToken = await getAccessToken(env, oauth.refresh_token_enc);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 404 = file da bi xoa tay tren Drive tu truoc - coi nhu thanh cong, khong chan viec xoa dong DB.
  if (!res.ok && res.status !== 404) throw new Error(`DRIVE_DELETE_FAILED: ${res.status} ${await res.text()}`);
}
