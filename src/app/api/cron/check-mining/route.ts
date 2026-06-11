import { NextResponse } from "next/server";
import { runMiningNotificationsCheck } from "@/lib/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  const authHeader = request.headers.get("Authorization");
  const expectedSecret = process.env.CRON_SECRET;

  const isLocalDev = process.env.NODE_ENV === "development";
  const isAuthorized = 
    isLocalDev || 
    (expectedSecret && (secret === expectedSecret || authHeader === `Bearer ${expectedSecret}`));

  if (!isAuthorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const result = await runMiningNotificationsCheck();
  return NextResponse.json(result);
}
