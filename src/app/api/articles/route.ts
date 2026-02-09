import { NextRequest, NextResponse } from 'next/server';

// POST: Add new article
export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        if (!url) {
            return NextResponse.json({ error: 'Missing url' }, { status: 400 });
        }

        // Fetch the page to extract title and favicon
        let title = url;
        let favicon = '';

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; StillRead/1.0)',
                },
                redirect: 'follow',
            });
            const html = await res.text();

            // Extract title
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                title = titleMatch[1].trim();
            }

            // Extract og:title as fallback
            if (title === url) {
                const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
                if (ogMatch) title = ogMatch[1].trim();
            }

            // Extract favicon
            const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
            if (faviconMatch) {
                const parsedUrl = new URL(url);
                try {
                    favicon = new URL(faviconMatch[1], parsedUrl.origin).href;
                } catch {
                    favicon = faviconMatch[1];
                }
            } else {
                const parsedUrl = new URL(url);
                favicon = `${parsedUrl.origin}/favicon.ico`;
            }
        } catch {
            // If fetching metadata fails, use defaults
            const parsedUrl = new URL(url);
            favicon = `${parsedUrl.origin}/favicon.ico`;
        }

        // Return the metadata — the client will handle localStorage storage
        return NextResponse.json({
            url,
            title,
            favicon,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
