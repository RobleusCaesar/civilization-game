"use strict";
/* Supabase project configuration.
   This key is SAFE to ship client-side: it's the project's publishable key,
   and Row Level Security (see /supabase/migrations/ and BACKEND.md) is the
   security boundary — the key only lets a browser act as the anonymous user
   it signed in as. Reverting to placeholder values turns cloud saves off
   (local emergency snapshot + file export still work). */
const SUPA_CFG = {
  url: 'https://draauhjtgifmelzwlojv.supabase.co',
  anonKey: 'sb_publishable_tmIxV1PtHcnNrLOEr3K6kQ_ytq9Ghkx',
};
