import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
    webpush.setVapidDetails('mailto:stillread@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
}

// In-memory push subscriptions (for localStorage mode)
// In production, these would be in a database
const subscriptions: PushSubscription[] = [];

export async function POST(request: NextRequest) {
    try {
        const { subscription } = await request.json();
        if (!subscription) {
            return NextResponse.json({ error: 'Missing subscription' }, { status: 400 });
        }
        subscriptions.push(subscription);
        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
