"use strict";
/* Supabase project configuration.
   The anon key is SAFE to ship client-side: Row Level Security (see
   /supabase/migrations/ and BACKEND.md) is the security boundary — the key
   only lets a browser act as the anonymous user it signed in as.
   While these hold placeholder values the game runs with cloud saves
   disabled (local emergency snapshot + file export still work). */
const SUPA_CFG = {
  url: 'PASTE_SUPABASE_URL',        // e.g. https://abcdefghijk.supabase.co
  anonKey: 'PASTE_SUPABASE_ANON_KEY',
};
