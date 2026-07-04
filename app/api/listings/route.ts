import { config } from "../../../src/config/env.js";
import { writeRealListingProof } from "../../../src/creator/listing-proof.js";
import { createStoredCreatorListing, readPublicCreatorFeed, type CreatorListingInput } from "../../../src/creator/listing-store.js";
import { verifyXStatusUrlLive } from "../../../src/creator/x-url-proof.js";
import { CREATOR_CATEGORIES, TIP_PRESETS_NGN } from "../../../src/creator/listings.js";
import { appAuthResponse, requireAppMutationAuth } from "../app-auth-response.js";

export const dynamic = "force-dynamic";

type ListingRequestBody = Record<string, unknown>;

export async function GET() {
  const items = await readPublicCreatorFeed();

  return Response.json({
    items,
    meta: {
      ngnPerUsdc: config.economics.ngnPerUsdc,
      categories: CREATOR_CATEGORIES,
      contentTypes: ["x-thread"],
      tipPresetsNgn: TIP_PRESETS_NGN,
    },
  });
}

export async function POST(request: Request) {
  try {
    await requireAppMutationAuth();
    const body = await request.json() as ListingRequestBody;
    const input: CreatorListingInput = {
      xHandle: requiredString(body.xHandle, "xHandle"),
      displayName: requiredString(body.displayName, "displayName"),
      walletAddress: requiredString(body.walletAddress, "walletAddress"),
      category: requiredString(body.category, "category"),
      title: requiredString(body.title, "title"),
      url: requiredString(body.url, "url"),
      description: requiredString(body.postContent ?? body.description, "postContent"),
      mediaUrls: mediaUrlsField(body.mediaUrls),
      suggestedTipNgn: Number(body.suggestedTipNgn),
      type: stringField(body.type ?? "x-thread"),
    };

    const xUrlProof = await verifyXStatusUrlLive(input.url);
    const item = await createStoredCreatorListing({ ...input, xUrlProof });
    const proof = await writeRealListingProof(item, xUrlProof);

    return Response.json({ item, proof: { xUrlProof: proof.listing.xUrlProof } }, { status: 201 });
  } catch (error) {
    const authResponse = appAuthResponse(error);
    if (authResponse) return authResponse;
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not create listing" },
      { status: 400 },
    );
  }
}

function requiredString(value: unknown, name: string): string {
  const parsed = stringField(value).trim();
  if (!parsed) throw new Error(name + " is required");
  return parsed;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mediaUrlsField(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}
