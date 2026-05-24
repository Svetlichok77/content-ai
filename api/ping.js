export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Missing env vars' });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/user_balance?select=id&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    );

    const timestamp = new Date().toISOString();
    console.log(`[ping] ${timestamp} — status: ${response.status}`);

    res.status(200).json({
      ok: true,
      timestamp,
      supabase_status: response.status,
      message: response.status === 200 ? '✅ Supabase alive and authorized' : `Status: ${response.status}`
    });

  } catch (error) {
    console.error('[ping] Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
