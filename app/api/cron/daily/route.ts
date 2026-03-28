import { after, NextRequest, NextResponse } from "next/server";
import { runImportJob } from "@/lib/jobs/import-tenders";
import { runDigestJob } from "@/lib/jobs/send-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    throw new Error("CRON_SECRET must be configured for the cron endpoint.");
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");

  return bearerToken === secret || headerSecret === secret;
}

async function handleCron(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const startedAt = new Date().toISOString();
    const runId = crypto.randomUUID();

    console.log("Daily cron job accepted:", {
      runId,
      startedAt,
      method: request.method,
      path: request.nextUrl.pathname,
    });

    after(async () => {
      const backgroundStartedAt = Date.now();
      try {
        console.log("Daily cron job started:", {
          runId,
          startedAt,
        });

        const importStartedAt = Date.now();
        const importResult = await runImportJob(console);
        const importDurationMs = Date.now() - importStartedAt;
        const digestResult = await runDigestJob(console, {
          totalExtracted: importResult.totalImported,
          durationMs: importDurationMs,
        });

        const finishedAt = new Date().toISOString();
        const durationMs = Date.now() - backgroundStartedAt;

        console.log("Daily cron job complete:", {
          runId,
          startedAt,
          finishedAt,
          durationMs,
          import: importResult,
          digest: digestResult,
        });
      } catch (error) {
        const failedAt = new Date().toISOString();
        const durationMs = Date.now() - backgroundStartedAt;
        console.error("Daily cron job failed:", error);
        console.error("Daily cron job failure details:", {
          runId,
          startedAt,
          failedAt,
          durationMs,
        });
      }
    });

    return NextResponse.json({
      ok: true,
      runId,
      accepted: true,
    });
  } catch (error) {
    console.error("Daily cron job failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
