import { handleProtectedTipRequest } from "../../../../src/payments/x402-gateway.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  return handle(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ listingId: string }> }) {
  return handle(request, params);
}

async function handle(request: Request, paramsPromise: Promise<{ listingId: string }>) {
  try {
    const { listingId } = await paramsPromise;
    return await handleProtectedTipRequest(request, listingId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not process tip" }, { status: 404 });
  }
}