// vote-callback — VibeTopList's vote webhook, turned into a card
// (supabase/migrations/0012_vote_reward.sql says the whole story).
//
// VibeTopList fires a POST and a GET here after every vote, carrying
// secret, voted, userid (the ?ref= the game put on the vote link), vote_id,
// userip and reset — in the query string, the form body or JSON; we read
// all three. It fires and forgets: any 2xx is logged as success, and it
// sends no auth header, so this function is deployed with JWT verification
// OFF and guards itself with the callback secret.
//
// DEPLOY (once): Supabase dashboard → Edge Functions → Deploy a new function
// → Via Editor, name it `vote-callback`, paste this file, Deploy; in its
// settings turn "Enforce JWT verification" OFF. Then Edge Functions →
// Secrets → add VTL_SECRET = the callback secret from VibeTopList (Dashboard
// → your listing → API & Callbacks). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided to every function by Supabase.
//
// The callback URL to give VibeTopList:
//   https://draauhjtgifmelzwlojv.supabase.co/functions/v1/vote-callback

const same = (a: string, b: string): boolean => {
  // compare without stopping at the first difference
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

Deno.serve(async (req: Request): Promise<Response> => {
  const p: Record<string, string> = {};
  const take = (k: string, v: unknown) => { if (v != null) p[String(k).toLowerCase()] = String(v); };
  try { new URL(req.url).searchParams.forEach((v, k) => take(k, v)); } catch (_) { /* no query */ }
  if (req.method === 'POST') {
    try {
      const type = req.headers.get('content-type') || '';
      const text = await req.text();
      if (/json/i.test(type) || /^\s*\{/.test(text)) {
        const j = JSON.parse(text);
        if (j && typeof j === 'object') for (const k of Object.keys(j)) take(k, (j as Record<string, unknown>)[k]);
      } else {
        new URLSearchParams(text).forEach((v, k) => take(k, v));
      }
    } catch (_) { /* a body we cannot read: the query string still counts */ }
  }

  const secret = Deno.env.get('VTL_SECRET') || '';
  if (!secret || !same(p.secret || '', secret)) return new Response('forbidden', { status: 403 });
  if (p.voted !== '1') return Response.json({ ok: true, granted: false, reason: 'not_voted' });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  try {
    const r = await fetch(url + '/rest/v1/rpc/vote_reward', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ref: p.userid || '', p_vote_id: p.vote_id || '' }),
    });
    const data = await r.json().catch(() => null);
    // always a 2xx once the secret is right: the site does not retry on our
    // answer, and a refusal here is ours to read in the function's logs
    if (!r.ok) console.error('vote_reward', r.status, JSON.stringify(data));
    return Response.json({ ok: r.ok, data });
  } catch (e) {
    console.error('vote_reward unreachable', String(e));
    return Response.json({ ok: false, reason: 'unreachable' });
  }
});
