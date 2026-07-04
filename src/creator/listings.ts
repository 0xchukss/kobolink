import { ngnToUsdc } from '../utils/currency.js';

export const CREATOR_CATEGORIES = ['ai', 'fintech', 'startups', 'news', 'music', 'crypto'] as const;
export const CONTENT_TYPES = ['x-thread'] as const;
export const TIP_PRESETS_NGN = [50, 100, 250] as const;

export type CreatorCategory = typeof CREATOR_CATEGORIES[number];
export type ContentType = typeof CONTENT_TYPES[number];

export type CreatorProfile = {
  id: string;
  xHandle: string;
  displayName: string;
  walletAddress: string;
  category: CreatorCategory;
};

export type ContentListing = {
  id: string;
  creatorId: string;
  title: string;
  url: string;
  description: string;
  mediaUrls?: string[];
  type: ContentType;
  suggestedTipNgn: number;
  suggestedTipUsdc: number;
};

export type PublicFeedItem = ContentListing & { creator: CreatorProfile };

export function isCreatorCategory(value: string): value is CreatorCategory {
  return CREATOR_CATEGORIES.includes(value as CreatorCategory);
}

export function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

export function createCreator(input: CreatorProfile): CreatorProfile {
  const xHandle = normalizeXHandle(input.xHandle);
  const displayName = input.displayName.trim();

  if (!displayName) throw new Error('displayName is required');
  if (!isCreatorCategory(input.category)) throw new Error('invalid creator category');
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress)) {
    throw new Error('walletAddress must be an EVM address');
  }

  return { ...input, xHandle, displayName };
}

export function createListing(
  input: Omit<ContentListing, 'suggestedTipUsdc'>,
  ngnPerUsdc: number,
): ContentListing {
  const title = input.title.trim();
  const url = input.url.trim();
  const description = input.description.trim();
  const mediaUrls = normalizeMediaUrls(input.mediaUrls ?? []);

  if (!title) throw new Error('title is required');
  if (!description) throw new Error('post content is required');
  if (!isContentType(input.type)) throw new Error('invalid content type');
  if (!isHttpUrl(url)) throw new Error('url must be an attached X status URL');
  if (input.type === 'x-thread' && !isXStatusUrl(url)) {
    throw new Error('x-thread listings must use a real X status URL from x.com or twitter.com');
  }
  if (input.suggestedTipNgn < 50) throw new Error('suggested tip must be at least ₦50');

  return {
    ...input,
    title,
    url,
    description,
    mediaUrls,
    suggestedTipUsdc: ngnToUsdc(input.suggestedTipNgn, ngnPerUsdc),
  };
}

export function publicFeed(creators: CreatorProfile[], listings: ContentListing[]): PublicFeedItem[] {
  return listings.map((listing) => {
    const creator = creators.find((candidate) => candidate.id === listing.creatorId);
    if (!creator) throw new Error('missing creator for listing ' + listing.id);
    return { ...listing, creator };
  });
}

export function isXStatusUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return false;
    return /^\/[A-Za-z0-9_]{1,15}\/status\/\d+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function xHandleFromStatusUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'x.com' && host !== 'twitter.com') return undefined;
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/\d+/);
    return match ? normalizeXHandle(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeXHandle(handle: string): string {
  const normalized = handle.trim().startsWith('@') ? handle.trim() : '@' + handle.trim();
  if (!/^@[A-Za-z0-9_]{1,15}$/.test(normalized)) throw new Error('invalid X handle');
  return normalized;
}

function normalizeMediaUrls(values: string[]): string[] {
  const urls = values.map((value) => value.trim()).filter(Boolean);
  if (urls.length > 4) throw new Error('mediaUrls supports up to 4 links');
  for (const url of urls) {
    if (!isHttpUrl(url)) throw new Error('mediaUrls must contain valid http(s) URLs');
  }
  return urls;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
