export type ProductPersona = {
  id: string;
  name: string;
  role: string;
  goal: string;
  primaryAction: string;
};

export const productPersonas: ProductPersona[] = [
  {
    id: "creator",
    name: "Nigerian X Creator",
    role: "Creator",
    goal: "List high-signal X posts and threads so fans can tip individual pieces without a subscription.",
    primaryAction: "Attaches an existing X post, pastes the post content/media links, and sets a suggested tip in Naira.",
  },
  {
    id: "fan",
    name: "Fan / Community Member",
    role: "Budget owner",
    goal: "Fund a small weekly budget and support Nigerian creators who publish useful content.",
    primaryAction: "Funds a real testnet budget and authorizes the agent to tip Nigerian creators within policy.",
  },
  {
    id: "agent",
    name: "KoboLink Tipping Agent",
    role: "Autonomous tipping agent",
    goal: "Evaluate listed creator content, decide what deserves support, and execute tips through x402 on Arc.",
    primaryAction: "Tips selected creators, explains each decision, and records Arc/Circle settlement proof.",
  },
];
