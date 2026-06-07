import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_COOKIE_NAME, getAdminSessionValue, isValidAdminPassword } from "@/lib/admin-auth";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const body = loginSchema.safeParse(await request.json());

  if (!body.success || !isValidAdminPassword(body.data.password)) {
    return NextResponse.json({ ok: false, message: "Invalid admin password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, await getAdminSessionValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
