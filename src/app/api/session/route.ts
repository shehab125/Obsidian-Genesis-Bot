import { NextResponse } from "next/server";
import { z } from "zod";
import { getMiniAppDataFromInitData } from "@/lib/store";

const sessionSchema = z.object({
  initData: z.string().min(1),
});

export async function POST(request: Request) {
  const body = sessionSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "Missing Telegram init data." }, { status: 400 });
  }

  const data = await getMiniAppDataFromInitData(body.data.initData);

  if (!data) {
    return NextResponse.json({ ok: false, message: "Invalid Telegram session." }, { status: 401 });
  }

  return NextResponse.json({ ok: true, ...data });
}
