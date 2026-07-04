import { config as appConfig } from "../config/env.js";

export type FlutterwaveConfigStatus = {
  hasPublicKey: boolean;
  hasSecretKey: boolean;
  hasEncryptionKey: boolean;
  ready: boolean;
};

function isSet(value: string | undefined): boolean {
  return Boolean(value && value.trim() && !value.includes("replace_me"));
}

export function getFlutterwaveConfigStatus(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): FlutterwaveConfigStatus {
  const status = {
    hasPublicKey: isSet(env.FLUTTERWAVE_PUBLIC_KEY ?? appConfig.flutterwave.publicKey),
    hasSecretKey: isSet(env.FLUTTERWAVE_SECRET_KEY ?? appConfig.flutterwave.secretKey),
    hasEncryptionKey: isSet(env.FLUTTERWAVE_ENCRYPTION_KEY ?? appConfig.flutterwave.encryptionKey),
  };

  return {
    ...status,
    ready: status.hasPublicKey && status.hasSecretKey && status.hasEncryptionKey,
  };
}