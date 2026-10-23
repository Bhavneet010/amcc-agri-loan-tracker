import { createClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import { createStorage } from './storage.ts';
import { SUPABASE_KEY } from '../../../lib/supabase-config.ts';

// Supabase supplies these server secrets. They are never returned by the API.
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createHandler(createStorage(client), [SUPABASE_KEY, Deno.env.get('SUPABASE_ANON_KEY') || '']));
