import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const keyEnvName = "AGENT_WALLET_ENCRYPTION_KEY";

export type EncryptedSecret = {
  encrypted: string;
  iv: string;
  authTag: string;
};

export function encryptSecret(value: string): EncryptedSecret {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const key = encryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(secret.encrypted, "base64")), decipher.final()]).toString("utf8");
}

function encryptionKey(): Buffer {
  const configured = process.env[keyEnvName]?.trim();
  if (!configured || configured.includes("replace_me")) {
    throw new Error(`${keyEnvName} is required before Neon can store per-user agent wallets.`);
  }

  if (/^[a-fA-F0-9]{64}$/.test(configured)) return Buffer.from(configured, "hex");
  return createHash("sha256").update(configured).digest();
}
