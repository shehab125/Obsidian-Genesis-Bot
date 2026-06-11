import { NextResponse } from "next/server";
import { z } from "zod";
import { claimMiningSession } from "@/lib/store";

const schema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ ok: false, message: "Invalid user ID." }, { status: 400 });
    }

    const result = await claimMiningSession(body.data.userId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Claim mining API error:", error);
    return NextResponse.json({ ok: false, message: "Server error claiming mining." }, { status: 500 });
  }
}
