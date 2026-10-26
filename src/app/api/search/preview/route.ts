import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { searchPreview } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "";
  const id = params.get("id") ?? "";
  if (!type || !id) return NextResponse.json({ error: "Missing result" }, { status: 400 });
  try {
    const preview = await searchPreview(user, type, id);
    if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ preview });
  } catch (error) {
    console.error("Search preview failed", error);
    return NextResponse.json({ error: "Preview is unavailable right now" }, { status: 500 });
  }
}
