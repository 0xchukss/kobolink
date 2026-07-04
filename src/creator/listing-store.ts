import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { config } from "../config/env.js";
import type { XUrlLiveProof } from "./x-url-proof.js";
import { ngnToKobo } from "../utils/currency.js";
import {
  createCreator,
  createListing,
  isContentType,
  isCreatorCategory,
  isXStatusUrl,
  xHandleFromStatusUrl,
  type ContentListing,
  type ContentType,
  type CreatorCategory,
  type CreatorProfile,
  type PublicFeedItem,
} from "./listings.js";

export type CreatorListingInput = {
  xHandle: string;
  xUserId?: string;
  displayName: string;
  walletAddress: string;
  category: string;
  title: string;
  url: string;
  description?: string;
  postContent?: string;
  mediaUrls?: string[];
  suggestedTipNgn: number;
  type?: string;
  xUrlProof?: XUrlLiveProof;
};

export type CreatorListingRecord = {
  creator: CreatorProfile;
  listing: ContentListing;
  xUserId?: string;
  attachmentSource?: "creator_attached";
  xUrlProof?: XUrlLiveProof;
  createdAt: string;
};

export type PublicCreatorFeedItem = PublicFeedItem & {
  createdAt: string;
  source: "local";
  suggestedTipKobo: number;
  x402PaymentPath: string;
};

const fallbackStorePath = "data/creator-listings.json";
export async function readCreatorListingRecords(path?: string): Promise<CreatorListingRecord[]> {
  return readLocalRecords(resolveStorePath(path));
}

export async function readPublicCreatorFeed(path?: string): Promise<PublicCreatorFeedItem[]> {
  const localRecords = await readLocalRecords(resolveStorePath(path));
  return localRecords.filter(isCurrentCreatorAttachedRecord).map((record) => toPublicFeedItem(record, "local"));
}

export async function createStoredCreatorListing(
  input: CreatorListingInput,
  path?: string,
  createdAt = new Date().toISOString(),
): Promise<PublicCreatorFeedItem> {
  const category = parseCategory(input.category);
  const type = parseContentType(input.type ?? "x-thread");
  const suggestedTipNgn = parseAmount(input.suggestedTipNgn);
  const storePath = resolveStorePath(path);

  if (type !== "x-thread") {
    throw new Error("KoboLink real-mode listings must be creator-attached X status posts.");
  }

  const creator = createCreator({
    id: "creator-" + randomUUID(),
    xHandle: input.xHandle,
    displayName: input.displayName,
    walletAddress: input.walletAddress,
    category,
  });

  const listing = createListing(
    {
      id: "listing-" + randomUUID(),
      creatorId: creator.id,
      title: input.title,
      url: input.url,
      description: manualPostContent(input),
      mediaUrls: input.mediaUrls ?? [],
      type,
      suggestedTipNgn,
    },
    config.economics.ngnPerUsdc,
  );

  assertAttachedPostMatchesCreator(listing, creator);

  const record: CreatorListingRecord = {
    creator,
    listing,
    xUserId: input.xUserId?.trim() || undefined,
    attachmentSource: "creator_attached",
    xUrlProof: assertLiveUrlProof(input.xUrlProof, listing),
    createdAt,
  };
  const records = await readLocalRecords(storePath);
  records.unshift(record);
  await writeLocalRecords(records, storePath);

  return toPublicFeedItem(record, "local");
}

async function readLocalRecords(path: string): Promise<CreatorListingRecord[]> {
  try {
    const raw = await readFile(/* turbopackIgnore: true */ path, "utf8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as CreatorListingRecord[];
    if (!Array.isArray(parsed)) throw new Error("listing store must contain an array");
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalRecords(records: CreatorListingRecord[], path: string): Promise<void> {
  await mkdir(/* turbopackIgnore: true */ dirname(path), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ path, JSON.stringify(records, null, 2) + "\n", "utf8");
}

function isCurrentCreatorAttachedRecord(record: CreatorListingRecord): boolean {
  if (record.attachmentSource !== "creator_attached") return false;
  if (record.listing.type !== "x-thread") return false;
  if (!record.listing.description?.trim()) return false;
  if (!isXStatusUrl(record.listing.url)) return false;
  if (xHandleFromStatusUrl(record.listing.url)?.toLowerCase() !== record.creator.xHandle.toLowerCase()) return false;
  return liveUrlProofMatchesListing(record.xUrlProof, record.listing);
}

function assertLiveUrlProof(proof: XUrlLiveProof | undefined, listing: ContentListing): XUrlLiveProof {
  if (!proof || !liveUrlProofMatchesListing(proof, listing)) {
    throw new Error("Creator listing requires a live X URL proof for the attached status URL.");
  }
  return proof;
}

function liveUrlProofMatchesListing(proof: XUrlLiveProof | undefined, listing: ContentListing): boolean {
  return Boolean(
    proof?.ok === true &&
      proof.method === "GET" &&
      proof.url === listing.url &&
      typeof proof.status === "number" &&
      proof.status >= 200 &&
      proof.status < 400 &&
      typeof proof.checkedAt === "string" &&
      proof.checkedAt.trim().length > 0,
  );
}

function assertAttachedPostMatchesCreator(listing: ContentListing, creator: CreatorProfile): void {
  if (listing.type !== "x-thread" || !isXStatusUrl(listing.url) || xHandleFromStatusUrl(listing.url)?.toLowerCase() !== creator.xHandle.toLowerCase()) {
    throw new Error("Attached X post URL must be a real status link whose handle matches the creator handle.");
  }
}

function toPublicFeedItem(record: CreatorListingRecord, source: "local"): PublicCreatorFeedItem {
  return {
    ...record.listing,
    creator: record.creator,
    createdAt: record.createdAt,
    source,
    suggestedTipKobo: ngnToKobo(record.listing.suggestedTipNgn),
    x402PaymentPath: "/x402/pay/" + record.listing.id,
  };
}

function manualPostContent(input: CreatorListingInput): string {
  return input.postContent ?? input.description ?? "";
}

function parseCategory(value: string): CreatorCategory {
  if (!isCreatorCategory(value)) throw new Error("invalid creator category");
  return value;
}

function parseContentType(value: string): ContentType {
  if (!isContentType(value)) throw new Error("invalid content type");
  return value;
}

function parseAmount(value: number): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("suggestedTipNgn must be a number");
  return amount;
}

function resolveStorePath(path?: string): string {
  return path ?? process.env.KOBOLINK_LISTINGS_STORE ?? fallbackStorePath;
}
