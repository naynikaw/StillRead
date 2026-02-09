import { NextRequest, NextResponse } from 'next/server';

// POST: Update scroll progress for an article
// This endpoint is called by the injected observer script via sendBeacon
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // Parse the body (sendBeacon sends as text/plain)
        let body;
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            body = await request.json();
        } else {
            const text = await request.text();
            try {
                body = JSON.parse(text);
            } catch {
                return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
            }
        }

        const { scrollPosition } = body;

        if (typeof scrollPosition !== 'number') {
            return NextResponse.json({ error: 'Missing scrollPosition' }, { status: 400 });
        }

        // Since we're using localStorage, the actual persistence happens client-side.
        // This endpoint exists so the injected observer script can call it via sendBeacon.
        // The parent frame listens for postMessage events and updates localStorage directly.
        // We just acknowledge the request here.
        return NextResponse.json({
            id,
            scrollPosition,
            updated: true,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
