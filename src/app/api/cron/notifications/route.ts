import { NextResponse, type NextRequest } from "next/server";
import { isAuthorisedCron } from "@/lib/cron";
import { deliverQueued } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  if (!isAuthorisedCron(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  return NextResponse.json({ delivered: await deliverQueued(100) });
}
