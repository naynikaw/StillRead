import { NextRequest, NextResponse } from 'next/server';

// General-purpose pass-through proxy for any resource type (JS, CSS, JSON API, images, etc.)
// This is used by the injected fetch/XHR interceptor to route SPA API calls through the server.
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': request.headers.get('accept') || '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': new URL(targetUrl).origin + '/',
            },
            redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const body = await response.arrayBuffer();

        return new NextResponse(body, {
            status: response.status,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Cache-Control': response.headers.get('cache-control') || 'public, max-age=3600',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const body = await request.arrayBuffer();
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': request.headers.get('content-type') || 'application/json',
                'Accept': request.headers.get('accept') || '*/*',
                'Referer': new URL(targetUrl).origin + '/',
            },
            body,
            redirect: 'follow',
        });

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const responseBody = await response.arrayBuffer();

        return new NextResponse(responseBody, {
            status: response.status,
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        },
    });
}
