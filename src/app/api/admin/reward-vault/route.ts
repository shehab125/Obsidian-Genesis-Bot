import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/store";

const POLYGON_RPC_ENDPOINTS = [
  "https://polygon-rpc.com",
  "https://rpc.ankr.com/polygon",
  "https://polygon.llamarpc.com",
  "https://polygon-bor.publicnode.com",
  "https://polygon.drpc.org",
  "https://1rpc.io/matic"
];

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
    const settings = await getAppSettings();
    const contractAddress = settings.tokenContractAddress || "0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F";
    const ownerWallet = settings.ownerWallet;

    if (!ownerWallet) {
      return NextResponse.json({
        ok: false,
        balance: "Error",
        message: "Owner wallet address not configured in settings."
      });
    }

    const cleanWallet = ownerWallet.trim().toLowerCase().replace(/^0x/, "");
    if (cleanWallet.length !== 40) {
      return NextResponse.json({
        ok: false,
        balance: "Error",
        message: `Owner wallet address is invalid. Must be exactly 40 hex characters (excluding 0x). Got: ${ownerWallet}`
      });
    }

    const paddedAddress = cleanWallet.padStart(64, "0");
    const data = `0x70a08231${paddedAddress}`;

    const result = await fetchWithFallback(
      POLYGON_RPC_ENDPOINTS,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: contractAddress, data }, "latest"],
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
      balance: "Error",
      message: String(error),
    });
  }
}
