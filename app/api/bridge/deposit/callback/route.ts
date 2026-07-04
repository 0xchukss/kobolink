export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json({
    ok: true,
    provider: "flutterwave-sandbox",
    message: "Flutterwave returned to KoboLink. Use the transaction_id to verify and credit the verified Naira bridge balance.",
    status: url.searchParams.get("status"),
    txRef: url.searchParams.get("tx_ref"),
    transactionId: url.searchParams.get("transaction_id"),
  });
}