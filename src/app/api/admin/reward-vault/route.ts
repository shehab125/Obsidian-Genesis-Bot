import { NextResponse } from "next/server";

const POLYGON_RPC_ENDPOINTS = [
  "https://polygon-bor.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic",
];

const OBSD_CONTRACT = "0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F";
const OWNER_WALLET = "0x7167C08FD45021c68993057d73f3b359446826350";
const ERC20_BALANCE_SELECTOR = "0x70a08231";

async function fetchWithFallback(endpoints: string[], body: string): Promise<any> {
  let lastError = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json();
      if (data.result && data.result !== "0x") return data;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All RPC endpoints failed");
}

export async function GET(request: Request) {
  try {
    // Format balance call: balanceof(address) -> selector + 32-bytes padded address
    const paddedAddress = OWNER_WALLET.replace("0x", "").toLowerCase().padStart(64, "0");
    const data = `${ERC20_BALANCE_SELECTOR}${paddedAddress}`;

    const result = await fetchWithFallback(
      POLYGON_RPC_ENDPOINTS,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: OBSD_CONTRACT, data }, "latest"],
      })
    );

    const rawBalance = BigInt(result.result);
    const decimals = 18;
    const balanceStr = (Number(rawBalance) / Math.pow(10, decimals)).toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });

    return NextResponse.json({
      ok: true,
      balance: `${balanceStr} OBSD`,
      rawBalance: rawBalance.toString(),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      balance: "Error fetching",
      message: String(error),
    });
  }
}
