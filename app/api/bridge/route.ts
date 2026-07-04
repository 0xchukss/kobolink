import { publicBridgeSnapshot, readBridgeState } from "../../../src/flutterwave/bridge-store.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(publicBridgeSnapshot(await readBridgeState()));
}