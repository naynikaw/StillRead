import { NextResponse } from 'next/server';

// POST: Nudge endpoint — checks for stale in-progress articles
// In a production setup with a DB, this would query and send push notifications.
// With localStorage, the nudge logic runs entirely on the client side.
export async function POST() {
    return NextResponse.json({
        message: 'Nudge check delegated to client-side with localStorage mode.',
        note: 'The client checks for stale articles and triggers notifications locally.',
    });
}
