import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const defaultProofFile = process.env.KOBOLINK_PROOF_FILE ?? "proofs/day1.json";

type JsonRecord = Record<string, unknown>;

function jsonSafe(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function readProof(path = defaultProofFile): Promise<JsonRecord> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as JsonRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        project: "KoboLink",
        phase: "day-1-testnet-payment-proof",
        createdAt: new Date().toISOString(),
      };
    }

    throw error;
  }
}

export async function recordProof(section: string, payload: JsonRecord, path = defaultProofFile): Promise<JsonRecord> {
  const proof = await readProof(path);
  const next = {
    ...proof,
    updatedAt: new Date().toISOString(),
    [section]: {
      recordedAt: new Date().toISOString(),
      ...payload,
    },
  };

  await mkdir(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path, `${JSON.stringify(next, jsonSafe, 2)}\n`, "utf8");
  return next;
}

export function proofFilePath(): string {
  return defaultProofFile;
}
