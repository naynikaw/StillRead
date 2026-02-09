// Supabase-backed storage for StillRead articles
// Replaces localStorage for cross-device sync

import { supabase } from './supabase';

export interface Article {
    id: string;
    url: string;
    title: string;
    favicon: string;
    scrollPosition: number;       // 0–100
    completionStatus: 'unread' | 'in-progress' | 'completed';
    lastUpdatedAt: string;        // ISO timestamp
    createdAt: string;
}

// Map Supabase snake_case rows to our camelCase Article interface
function mapRow(row: Record<string, unknown>): Article {
    return {
        id: row.id as string,
        url: row.url as string,
        title: row.title as string,
        favicon: (row.favicon as string) || '',
        scrollPosition: (row.scroll_position as number) || 0,
        completionStatus: (row.completion_status as Article['completionStatus']) || 'unread',
        lastUpdatedAt: row.last_updated_at as string,
        createdAt: row.created_at as string,
    };
}

export async function listArticles(): Promise<Article[]> {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .order('last_updated_at', { ascending: false });

    if (error) {
        console.error('Error fetching articles:', error);
        return [];
    }

    return (data || []).map(mapRow);
}

export async function getArticle(id: string): Promise<Article | null> {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching article:', error);
        return null;
    }

    return data ? mapRow(data) : null;
}

export async function addArticle(url: string, title: string, favicon: string): Promise<Article | null> {
    const { data, error } = await supabase
        .from('articles')
        .insert({
            url,
            title,
            favicon,
            scroll_position: 0,
            completion_status: 'unread',
            last_updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding article:', error);
        return null;
    }

    return data ? mapRow(data) : null;
}

export async function updateProgress(id: string, scrollPosition: number): Promise<Article | null> {
    let completionStatus: Article['completionStatus'] = 'in-progress';
    if (scrollPosition >= 98) {
        completionStatus = 'completed';
    } else if (scrollPosition <= 0) {
        completionStatus = 'unread';
    }

    const { data, error } = await supabase
        .from('articles')
        .update({
            scroll_position: scrollPosition,
            completion_status: completionStatus,
            last_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating progress:', error);
        return null;
    }

    return data ? mapRow(data) : null;
}

export async function deleteArticle(id: string): Promise<boolean> {
    const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting article:', error);
        return false;
    }

    return true;
}

export async function getStaleInProgress(hoursThreshold = 24): Promise<Article[]> {
    const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('completion_status', 'in-progress')
        .lt('last_updated_at', cutoff);

    if (error) {
        console.error('Error fetching stale articles:', error);
        return [];
    }

    return (data || []).map(mapRow);
}

export async function getMostRecentInProgress(): Promise<Article | null> {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('completion_status', 'in-progress')
        .order('last_updated_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        // No in-progress articles is not an error
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching recent article:', error);
        return null;
    }

    return data ? mapRow(data) : null;
}

// Subscribe to real-time changes on the articles table
export function subscribeToArticles(callback: (articles: Article[]) => void) {
    const channel = supabase
        .channel('articles-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'articles' },
            async () => {
                // Re-fetch all articles on any change
                const articles = await listArticles();
                callback(articles);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}
