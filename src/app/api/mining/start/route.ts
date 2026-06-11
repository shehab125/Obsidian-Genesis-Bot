import { NextResponse } from "next/server";
import { z } from "zod";
import { startMiningSession } from "@/lib/store";

const schema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ ok: false, message: "Invalid user ID." }, { status: 400 });
    }

    const result = await startMiningSession(body.data.userId);
    return NextResponse.json(result, { status: result.ok ? 200 : 200 }); // Return 200 to prevent Axios/Fetch throws in simple client setups
  } catch (error) {
    console.error("Start mining API error:", error);
    return NextResponse.json({ ok: false, message: "Server error starting mining." }, { status: 500 });
  }
}
