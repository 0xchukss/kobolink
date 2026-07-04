import { createCreator, createListing, publicFeed } from "../../dist/creator/listings.js";

const rate = 1550;

export const testCreators = [
  createCreator({
    id: "creator-adaobi",
    xHandle: "@adaobiokoro",
    displayName: "Adaobi Okoro",
    walletAddress: "0x1111111111111111111111111111111111111111",
    category: "ai",
  }),
  createCreator({
    id: "creator-chuks",
    xHandle: "@Chuksdakingz",
    displayName: "Chuks",
    walletAddress: "0x2222222222222222222222222222222222222222",
    category: "fintech",
  }),
  createCreator({
    id: "creator-newsroom",
    xHandle: "@lagosnewsroom",
    displayName: "Lagos Newsroom",
    walletAddress: "0x4444444444444444444444444444444444444444",
    category: "news",
  }),
];

export const testListings = [
  createListing({
    id: "listing-arc-ai",
    creatorId: "creator-adaobi",
    title: "Why Nigerian AI builders need stablecoin rails",
    url: "https://x.com/adaobiokoro/status/1001",
    description: "A thread on Arc, agents, and small creator payments.",
    type: "x-thread",
    suggestedTipNgn: 150,
  }, rate),
  createListing({
    id: "listing-x402",
    creatorId: "creator-chuks",
    title: "How x402 can unlock pay-per-thread content",
    url: "https://x.com/Chuksdakingz/status/1002",
    description: "A practical breakdown for Nigerian X creators.",
    type: "x-thread",
    suggestedTipNgn: 250,
  }, rate),
  createListing({
    id: "listing-agent-budgeting",
    creatorId: "creator-adaobi",
    title: "Agent budgets for useful Nigerian AI threads",
    url: "https://x.com/adaobiokoro/status/1003",
    description: "How fan-funded agent policies can route USDC tips to high-signal AI posts.",
    type: "x-thread",
    suggestedTipNgn: 250,
  }, rate),
  createListing({
    id: "listing-circle-gateway",
    creatorId: "creator-chuks",
    title: "Circle Gateway receipts for creator communities",
    url: "https://x.com/Chuksdakingz/status/1004",
    description: "A fintech explainer on payment receipts and x402-protected routes.",
    type: "x-thread",
    suggestedTipNgn: 250,
  }, rate),
  createListing({
    id: "listing-news-context",
    creatorId: "creator-newsroom",
    title: "What a useful local news thread should cost",
    url: "https://x.com/lagosnewsroom/status/1007",
    description: "A news creator explains reader-funded context and verification.",
    type: "x-thread",
    suggestedTipNgn: 100,
  }, rate),
];

export const testPublicFeed = publicFeed(testCreators, testListings);
