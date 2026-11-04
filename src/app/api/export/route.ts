import { NextRequest, NextResponse } from 'next/server';
import { getActor } from '@/server/session';
import { generateExportCsv, type ExportType } from '@/server/export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) {
    return new NextResponse('Unauthorized: Sign in to export reports', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const typeParam = searchParams.get('type') as ExportType | null;

  if (!typeParam || !['requests', 'candidates', 'audit'].includes(typeParam)) {
    return new NextResponse('Invalid export type. Must be requests, candidates, or audit.', {
      status: 400,
    });
  }

  try {
    const { csv, filename } = await generateExportCsv(actor, typeParam);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Export failed';
    return new NextResponse(message, { status: 403 });
  }
}

