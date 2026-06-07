import { NextResponse } from "next/server";
import { verifyUserPurchase } from "@/lib/store";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const result = await verifyUserPurchase(id);

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
