import { NextResponse } from "next/server";
import {
  addAdminEmail,
  isAdminEmail,
  isPresetAdminEmail,
  listAdminEmails,
  removeAdminEmail,
  requireUser
} from "@/lib/api/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admins = await listAdminEmails();
    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list admins" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail =
    typeof payload === "object" && payload !== null && "email" in payload
      ? (payload as { email?: unknown }).email
      : null;

  if (typeof rawEmail !== "string" || !EMAIL_PATTERN.test(rawEmail.trim())) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  if (isPresetAdminEmail(email)) {
    return NextResponse.json(
      { error: "This email is already a preset admin" },
      { status: 409 }
    );
  }

  try {
    await addAdminEmail(email, user.id);
    const admins = await listAdminEmails();
    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add admin" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (!user) {
    return response;
  }

  if (!(await isAdminEmail(user.email))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawEmail = url.searchParams.get("email");

  if (!rawEmail || !EMAIL_PATTERN.test(rawEmail.trim())) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const email = rawEmail.trim().toLowerCase();

  if (isPresetAdminEmail(email)) {
    return NextResponse.json(
      { error: "Preset admins cannot be removed" },
      { status: 400 }
    );
  }

  try {
    await removeAdminEmail(email);
    const admins = await listAdminEmails();
    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove admin" },
      { status: 500 }
    );
  }
}
