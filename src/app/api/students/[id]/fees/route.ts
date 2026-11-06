import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getStudentFeeMonths, getStudentOutstandingVouchers } from "@/lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user || !can(user.role, "fees.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (new URL(request.url).searchParams.get("outstanding")) {
    try {
      return NextResponse.json({ outstanding: await getStudentOutstandingVouchers(id) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load fees" }, { status: 400 });
    }
  }
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  try {
    return NextResponse.json({ months: await getStudentFeeMonths(id, year) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load fees" }, { status: 400 });
  }
}
