import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask } from "@/lib/store";

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  platform: z.enum(["telegram", "x"]),
  reward: z.number().int().positive(),
  targetUrl: z.string().url(),
  proofRequired: z.boolean(),
});

export async function POST(request: Request) {
  const body = taskSchema.safeParse(await request.json());

  if (!body.success) {
    return NextResponse.json({ ok: false, message: "Invalid task data." }, { status: 400 });
  }

  const result = await createTask(body.data);
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
