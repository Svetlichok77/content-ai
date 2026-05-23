export default async function handler(req, res) {
  const SUPABASE_URL = 'https://xacasrnthainxjzxhypb.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

  try {
    // Делаем простой запрос к Supabase чтобы он не засыпал
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
      message: 'Supabase is alive'
    });

  } catch (error) {
    console.error('[ping] Error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
