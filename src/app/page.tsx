'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Article,
    listArticles,
    addArticle,
    updateProgress,
    deleteArticle,
    getMostRecentInProgress,
    subscribeToArticles,
} from '@/lib/storage';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
    const { user, loading: authLoading, signOut } = useAuth();
    const router = useRouter();

    // ALL hooks must be declared before any conditional returns (React rules of hooks)
    const [articles, setArticles] = useState<Article[]>([]);
    const [resumeArticle, setResumeArticle] = useState<Article | null>(null);
    const [activeArticle, setActiveArticle] = useState<Article | null>(null);
    const [scrollPercent, setScrollPercent] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [iframeLoading, setIframeLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Redirect to auth if not signed in
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/auth');
        }
    }, [user, authLoading, router]);

    // Check mobile
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // On mobile, start with sidebar closed
    useEffect(() => {
        if (isMobile) setSidebarOpen(false);
    }, [isMobile]);

    // Load articles from Supabase + subscribe to real-time changes
    useEffect(() => {
        // Initial load
        const loadData = async () => {
            const arts = await listArticles();
            setArticles(arts);
            const recent = await getMostRecentInProgress();
            setResumeArticle(recent);
        };
        loadData();

        // Real-time subscription: any change on any device updates the list
        const unsubscribe = subscribeToArticles(async (updatedArticles) => {
            setArticles(updatedArticles);
            const recent = await getMostRecentInProgress();
            setResumeArticle(recent);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    // Listen for scroll updates from the iframe
    useEffect(() => {
        function handleMessage(e: MessageEvent) {
            if (e.data?.type === 'stillread-scroll' && activeArticle) {
                const pct = Math.round(e.data.scrollPosition * 10) / 10;
                setScrollPercent(pct);
                // Async update — fire and forget
                updateProgress(e.data.articleId, pct).then((updated) => {
                    if (updated) {
                        // Real-time subscription will handle the list refresh
                    }
                });
            }
            if (e.data?.type === 'stillread-ready' && activeArticle) {
                // Observer is ready, send saved scroll position
                if (iframeRef.current?.contentWindow && activeArticle.scrollPosition > 0) {
                    setTimeout(() => {
                        iframeRef.current?.contentWindow?.postMessage(
                            {
                                type: 'stillread-restore',
                                scrollPosition: activeArticle.scrollPosition,
                            },
                            '*'
                        );
                    }, 800);
                }
                setIframeLoading(false);
            }
        }
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [activeArticle]);

    // Register service worker for push notifications
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => { });
        }
        // Check for stale articles and show nudge
        const staleCheck = async () => {
            const recent = await getMostRecentInProgress();
            if (recent) {
                const hoursSince =
                    (Date.now() - new Date(recent.lastUpdatedAt).getTime()) / (1000 * 60 * 60);
                if (hoursSince > 24 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('StillRead', {
                        body: `You left off at ${Math.round(recent.scrollPosition)}% of "${recent.title}". Resume reading?`,
                        icon: '/icon-192.png',
                    });
                }
            }
        };
        staleCheck();
    }, []);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    // Open article in reader
    const openArticle = useCallback(
        (article: Article) => {
            setActiveArticle(article);
            setScrollPercent(article.scrollPosition);
            setIframeLoading(true);
            if (isMobile) setSidebarOpen(false);
        },
        [isMobile]
    );

    // Add new article
    const handleAddArticle = async () => {
        if (!urlInput.trim()) return;

        let url = urlInput.trim();
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/articles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (res.ok) {
                await addArticle(data.url, data.title, data.favicon);
                // Real-time subscription will update the list
                setUrlInput('');
                setModalOpen(false);
                showToast('📖 Article saved to your reading list');
            } else {
                showToast(`❌ ${data.error || 'Failed to add article'}`);
            }
        } catch {
            showToast('❌ Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Delete article
    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const success = await deleteArticle(id);
        if (success) {
            // Manually refresh list (don't rely solely on real-time subscription)
            const updated = await listArticles();
            setArticles(updated);
            const recent = await getMostRecentInProgress();
            setResumeArticle(recent);
            if (activeArticle?.id === id) {
                setActiveArticle(null);
                setScrollPercent(0);
            }
            showToast('🗑️ Article removed');
        } else {
            showToast('❌ Failed to delete article');
        }
    };

    // Request notification permission
    const requestNotifPermission = () => {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    };

    // Group articles by status
    const inProgress = articles.filter((a) => a.completionStatus === 'in-progress');
    const unread = articles.filter((a) => a.completionStatus === 'unread');
    const completed = articles.filter((a) => a.completionStatus === 'completed');

    const getDomain = (url: string) => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    };

    // Show nothing while checking auth (must come after all hooks)
    if (authLoading || !user) {
        return (
            <div className="auth-loading">
                <div className="reader-loading-spinner" />
            </div>
        );
    }

    return (
        <div className="app-shell">
            {/* Sidebar overlay for mobile */}
            <div
                className={`sidebar-overlay ${sidebarOpen && isMobile ? 'visible' : ''}`}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${!sidebarOpen && !isMobile ? 'collapsed' : ''} ${sidebarOpen && isMobile ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">📚</div>
                        <span className="sidebar-logo-text">StillRead</span>
                    </div>
                    <div className="sidebar-user-row">
                        <span className="sidebar-user-email">{user?.email ?? ''}</span>
                        <button className="sidebar-signout" onClick={() => signOut()} title="Sign out">↗</button>
                    </div>
                </div>

                <div className="sidebar-content">
                    {/* Resume Reading Card */}
                    {resumeArticle && (
                        <div
                            className="resume-card"
                            onClick={() => openArticle(resumeArticle)}
                        >
                            <div className="resume-label">▶ Resume Reading</div>
                            <div className="resume-title">{resumeArticle.title}</div>
                            <div className="resume-progress">
                                <div
                                    className="resume-progress-bar"
                                    style={{ width: `${resumeArticle.scrollPosition}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* In Progress */}
                    {inProgress.length > 0 && (
                        <div className="section-group">
                            <div className="section-label">
                                <span className="status-dot in-progress" />
                                In Progress
                                <span className="section-count">{inProgress.length}</span>
                            </div>
                            {inProgress.map((article) => (
                                <div
                                    key={article.id}
                                    className={`article-card ${activeArticle?.id === article.id ? 'active' : ''}`}
                                    onClick={() => openArticle(article)}
                                >
                                    <div className="article-favicon">
                                        {article.favicon ? (
                                            <img
                                                src={article.favicon}
                                                alt=""
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            '📄'
                                        )}
                                    </div>
                                    <div className="article-info">
                                        <div className="article-title">{article.title}</div>
                                        <div className="article-meta">
                                            <span className="article-domain">{getDomain(article.url)}</span>
                                            <div className="article-progress-mini">
                                                <div
                                                    className="article-progress-mini-bar"
                                                    style={{ width: `${article.scrollPosition}%` }}
                                                />
                                            </div>
                                            <span className="article-percent">
                                                {Math.round(article.scrollPosition)}%
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="article-delete"
                                        onClick={(e) => handleDelete(e, article.id)}
                                        aria-label="Delete article"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Unread */}
                    {unread.length > 0 && (
                        <div className="section-group">
                            <div className="section-label">
                                <span className="status-dot unread" />
                                To Read
                                <span className="section-count">{unread.length}</span>
                            </div>
                            {unread.map((article) => (
                                <div
                                    key={article.id}
                                    className={`article-card ${activeArticle?.id === article.id ? 'active' : ''}`}
                                    onClick={() => openArticle(article)}
                                >
                                    <div className="article-favicon">
                                        {article.favicon ? (
                                            <img
                                                src={article.favicon}
                                                alt=""
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            '📄'
                                        )}
                                    </div>
                                    <div className="article-info">
                                        <div className="article-title">{article.title}</div>
                                        <div className="article-meta">
                                            <span className="article-domain">{getDomain(article.url)}</span>
                                        </div>
                                    </div>
                                    <button
                                        className="article-delete"
                                        onClick={(e) => handleDelete(e, article.id)}
                                        aria-label="Delete article"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Completed */}
                    {completed.length > 0 && (
                        <div className="section-group">
                            <div className="section-label">
                                <span className="status-dot completed" />
                                Completed
                                <span className="section-count">{completed.length}</span>
                            </div>
                            {completed.map((article) => (
                                <div
                                    key={article.id}
                                    className={`article-card ${activeArticle?.id === article.id ? 'active' : ''}`}
                                    onClick={() => openArticle(article)}
                                >
                                    <div className="article-favicon">
                                        {article.favicon ? (
                                            <img
                                                src={article.favicon}
                                                alt=""
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            '📄'
                                        )}
                                    </div>
                                    <div className="article-info">
                                        <div className="article-title">{article.title}</div>
                                        <div className="article-meta">
                                            <span className="article-domain">{getDomain(article.url)}</span>
                                            <span className="article-percent" style={{ color: 'var(--success)' }}>
                                                ✓ Done
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="article-delete"
                                        onClick={(e) => handleDelete(e, article.id)}
                                        aria-label="Delete article"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {articles.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                            <div style={{ fontSize: '36px', marginBottom: '16px' }}>📚</div>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                Your reading list is empty.
                                <br />
                                Add an article to get started!
                            </p>
                        </div>
                    )}
                </div>

                <div className="sidebar-footer">
                    <button className="add-article-btn" onClick={() => { setModalOpen(true); requestNotifPermission(); }}>
                        <span>+</span> Add Article
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`main-content ${!sidebarOpen && !isMobile ? 'expanded' : ''}`}>
                {/* Progress bar */}
                <div className={`reading-progress ${!sidebarOpen && !isMobile ? 'expanded' : ''}`}>
                    {activeArticle && (
                        <div
                            className="reading-progress-bar"
                            style={{ width: `${scrollPercent}%` }}
                        />
                    )}
                </div>

                {/* Reader header */}
                <div className={`reader-header ${!sidebarOpen && !isMobile ? 'expanded' : ''}`}>
                    <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        {sidebarOpen ? '◁' : '☰'}
                    </button>
                    <div className="reader-title">
                        {activeArticle ? activeArticle.title : 'StillRead'}
                    </div>
                    {activeArticle && (
                        <div className="reader-percent">{Math.round(scrollPercent)}%</div>
                    )}
                </div>

                {/* Reader viewport or empty state */}
                {activeArticle ? (
                    <div className="reader-viewport">
                        {iframeLoading && (
                            <div className="reader-loading">
                                <div className="reader-loading-spinner" />
                                <div className="reader-loading-text">Loading article...</div>
                            </div>
                        )}
                        <iframe
                            ref={iframeRef}
                            className="reader-iframe"
                            src={`/api/proxy?url=${encodeURIComponent(activeArticle.url)}&articleId=${activeArticle.id}`}
                            style={{ display: iframeLoading ? 'none' : 'block' }}
                            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                            onLoad={() => {
                                // Fallback: if observer script doesn't fire 'ready', stop loading after 5s
                                setTimeout(() => setIframeLoading(false), 5000);
                            }}
                        />
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">📖</div>
                        <h1 className="empty-title">Pick Up Where You Left Off</h1>
                        <p className="empty-desc">
                            Save articles from anywhere and read them in their original format.
                            Your scroll position syncs across all your devices.
                        </p>
                        <button className="empty-cta" onClick={() => setModalOpen(true)}>
                            <span>+</span> Add Your First Article
                        </button>
                    </div>
                )}
            </main>

            {/* Add Article Modal */}
            {modalOpen && (
                <div className="modal-overlay" onClick={() => !loading && setModalOpen(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Add Article</h2>
                        <p className="modal-desc">
                            Paste any article URL to add it to your reading list.
                        </p>
                        <input
                            className="modal-input"
                            type="url"
                            placeholder="https://example.com/article..."
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddArticle()}
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button
                                className="btn-secondary"
                                onClick={() => setModalOpen(false)}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleAddArticle}
                                disabled={loading || !urlInput.trim()}
                            >
                                {loading ? <span className="spinner" /> : 'Save Article'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast notification */}
            <div className={`toast ${toast ? 'visible' : ''}`}>
                <span>{toast}</span>
            </div>
        </div>
    );
}
