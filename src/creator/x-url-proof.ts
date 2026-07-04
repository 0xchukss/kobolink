import { isXStatusUrl } from "./listings.js";

export type XUrlLiveProof = {
  ok: boolean;
  url: string;
  finalUrl?: string;
  status?: number;
  checkedAt: string;
  method: "GET";
  note: string;
};

export type FetchLike = (url: string, init: {
  method: "GET";
  redirect: "follow";
  headers: Record<string, string>;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  body?: { cancel?: () => Promise<void> | void } | null;
}>;

export async function verifyXStatusUrlLive(
  value: string,
  fetcher: FetchLike = globalThis.fetch as FetchLike,
  checkedAt = new Date().toISOString(),
): Promise<XUrlLiveProof> {
  const url = value.trim();
  if (!isXStatusUrl(url)) throw new Error("KOBOLINK_LISTING_X_URL must be a real x.com or twitter.com status URL");
  if (typeof fetcher !== "function") throw new Error("No fetch implementation is available for live X URL verification");

  const response = await fetcher(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "KoboLink real-mode X URL verifier",
    },
    signal: AbortSignal.timeout(10000),
  });

  await response.body?.cancel?.();

  const finalUrl = response.url || url;
  const proof: XUrlLiveProof = {
    ok: response.status >= 200 && response.status < 400,
    url,
    finalUrl,
    status: response.status,
    checkedAt,
    method: "GET",
    note: "Live URL check only. KoboLink does not scrape post content or media; creator-supplied fields remain authoritative.",
  };

  if (!proof.ok) {
    throw new Error("Attached X status URL did not return a live success response. Status: " + response.status);
  }

  return proof;
}
