import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { globalSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ groups: [] });
  try {
    return NextResponse.json({ groups: await globalSearch(user, q) });
  } catch (error) {
    console.error("Global search failed", error);
    return NextResponse.json({ error: "Search is unavailable right now" }, { status: 500 });
  }
}
