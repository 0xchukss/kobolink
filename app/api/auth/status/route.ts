import { publicClerkServerStatus } from "../../../../src/auth/clerk-server.js";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ clerk: publicClerkServerStatus() });
}
