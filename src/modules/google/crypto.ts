import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: "iv.tag.datos" en base64. La llave vive solo en el servidor (GOOGLE_TOKEN_KEY).
export function encrypt(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(sealed: string, keyB64: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
