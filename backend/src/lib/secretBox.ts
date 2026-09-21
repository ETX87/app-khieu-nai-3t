// Ma hoa gia tri nhay cam (vd refresh_token Google Drive) de luu trong D1 - AES-GCM, khoa dan xuat
// tu SESSION_SECRET da co san (khong can them secret rieng). Tien to "secretBox:v1:" domain-separate
// voi cac muc dich khac dung chung SESSION_SECRET (vd ky JWT session) de tranh dung nham khoa.
// Copy nguyen pattern tu vi-pham-app (qlbh3t-cf-integrations skill) - da chay that tren production.

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`secretBox:v1:${secret}`));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encryptSecret(plaintext: string, sessionSecret: string): Promise<string> {
  const key = await deriveKey(sessionSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipherBuf))}`;
}

export async function decryptSecret(encoded: string, sessionSecret: string): Promise<string> {
  const [ivB64, cipherB64] = encoded.split(".");
  const key = await deriveKey(sessionSecret);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(cipherB64),
  );
  return new TextDecoder().decode(plainBuf);
}
