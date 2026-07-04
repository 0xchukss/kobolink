import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { handleProtectedTipRequest } from "./x402-gateway.js";

export type LocalX402Server = {
  origin: string;
  close: () => Promise<void>;
};

export async function startLocalX402Server(): Promise<LocalX402Server> {
  const server = createServer((request, response) => {
    void handleLocalRequest(request, response);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    origin: "http://127.0.0.1:" + address.port,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function handleLocalRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const host = request.headers.host ?? "127.0.0.1";
    const url = new URL(request.url ?? "/", "http://" + host);
    const match = url.pathname.match(/^\/x402\/pay\/([^/]+)$/);

    if (!match) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(", "));
      else if (value !== undefined) headers.set(key, value);
    }

    const protectedRequest = new Request(url.toString(), {
      method: request.method ?? "GET",
      headers,
    });

    const protectedResponse = await handleProtectedTipRequest(protectedRequest, decodeURIComponent(match[1]));
    const responseHeaders: Record<string, string> = {};
    protectedResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    response.writeHead(protectedResponse.status, responseHeaders);
    response.end(Buffer.from(await protectedResponse.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
}
