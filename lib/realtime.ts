import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.ts';
// Loaded on demand after the workspace starts. No auth tokens are persisted.
export function subscribeToChanges(changed: () => void, connected: (value: boolean) => void): () => void {
  const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const notify = () => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) changed(); }, 150); };
  const channel = client.channel('amcc-workspace').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'amcc_changes' }, notify).subscribe(status => {
    if (stopped) return;
    connected(status === 'SUBSCRIBED');
    if (status === 'SUBSCRIBED') notify(); // Reconcile changes missed while connecting.
  });
  return () => { stopped = true; clearTimeout(timer); connected(false); void client.removeChannel(channel); };
}
