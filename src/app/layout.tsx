import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'StillRead — Pick Up Where You Left Off',
    description:
        'Save articles and read them later with synced scroll position across all your devices. Your reading list, always in progress.',
    manifest: '/manifest.json',
    icons: {
        icon: '/icon-192.png',
        apple: '/icon-512.png',
    },
};

export const viewport: Viewport = {
    themeColor: '#7c6df0',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
