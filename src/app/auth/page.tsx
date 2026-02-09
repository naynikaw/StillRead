'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const { signIn, signUp } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);

        if (!email.trim() || !password.trim()) {
            setError('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);

        if (mode === 'signin') {
            const { error: err } = await signIn(email, password);
            if (err) {
                setError(err);
                setLoading(false);
            } else {
                router.push('/');
            }
        } else {
            const { error: err } = await signUp(email, password);
            if (err) {
                setError(err);
                setLoading(false);
            } else {
                setSuccess('Check your email to confirm your account, then sign in.');
                setMode('signin');
                setPassword('');
                setLoading(false);
            }
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-logo">
                    <span className="auth-logo-icon">📚</span>
                    <h1 className="auth-logo-text">StillRead</h1>
                    <p className="auth-tagline">Pick up where you left off, on any device.</p>
                </div>

                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="auth-toggle">
                        <button
                            type="button"
                            className={`auth-toggle-btn ${mode === 'signin' ? 'active' : ''}`}
                            onClick={() => { setMode('signin'); setError(null); setSuccess(null); }}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            className={`auth-toggle-btn ${mode === 'signup' ? 'active' : ''}`}
                            onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
                        >
                            Sign Up
                        </button>
                    </div>

                    {error && <div className="auth-error">{error}</div>}
                    {success && <div className="auth-success">{success}</div>}

                    <input
                        className="auth-input"
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                        autoComplete="email"
                    />

                    <input
                        className="auth-input"
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />

                    <button
                        className="auth-submit"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="spinner" />
                        ) : mode === 'signin' ? (
                            'Sign In'
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
