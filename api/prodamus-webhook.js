// ============================================================
// VERCEL SERVERLESS FUNCTION: api/prodamus-webhook.js
//
// ИНСТРУКЦИЯ:
// 1. Создай папку /api в корне проекта на Vercel (если нет)
// 2. Положи этот файл как /api/prodamus-webhook.js
// 3. В Vercel → Settings → Environment Variables добавь:
//    SUPABASE_URL      = https://xacasrnthainxjzxhypb.supabase.co
//    SUPABASE_SERVICE_KEY = (берёшь из Supabase → Settings → API → Secret key)
// 4. В дашборде Продамуса → Настройки → Настройка уведомлений:
//    URL адрес для уведомлений = https://content-ai-gilt.vercel.app/api/prodamus-webhook
// 5. Убедись что Prodamus отправляет POST с JSON
// ============================================================

const TIER_PACKS = { test: 10, start: 50, pro: 200, max: 500 };

// Определяем тариф по названию продукта в заказе Продамуса
function detectTierFromProduct(productName) {
  if (!productName) return null;
  const name = productName.toLowerCase();
  if (name.includes('max') || name.includes('макс') || name.includes('2490')) return 'max';
  if (name.includes('pro') || name.includes('про') || name.includes('990')) return 'pro';
  if (name.includes('start') || name.includes('старт') || name.includes('290')) return 'start';
  if (name.includes('test') || name.includes('тест') || name.includes('50')) return 'test';
  return null;
}

export default async function handler(req, res) {
  // Принимаем только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    console.log('Prodamus webhook received:', JSON.stringify(body));

    // Проверяем статус платежа
    // Продамус отправляет разные поля в зависимости от версии API
    const status = (
      body.payment_status ||
      body.status ||
      body.order_status ||
      ''
    ).toLowerCase();

    const isPaid = ['success', 'paid', 'completed', 'оплачен', 'successful'].includes(status);

    if (!isPaid) {
      console.log('Payment not successful, status:', status);
      return res.status(200).json({ ok: true, message: 'Not a success payment, ignored' });
    }

    // Получаем email покупателя
    const email = (
      body.customer_email ||
      body.email ||
      body.buyer_email ||
      (body.customer && body.customer.email) ||
      ''
    ).toLowerCase().trim();

    if (!email) {
      console.error('No email in webhook body');
      return res.status(400).json({ error: 'No email found in payment data' });
    }

    // Определяем тариф
    const productName = (
      (body.products && body.products[0] && body.products[0].name) ||
      body.product_name ||
      body.order_name ||
      ''
    );
    const tier = detectTierFromProduct(productName);
    const generationsToAdd = tier ? TIER_PACKS[tier] : 0;

    if (!tier || !generationsToAdd) {
      console.error('Could not detect tier from product:', productName);
      // Отвечаем 200 чтобы Продамус не повторял вебхук, но логируем проблему
      return res.status(200).json({
        ok: false,
        message: 'Could not detect tier from product name: ' + productName
      });
    }

    console.log(`Processing payment: email=${email}, tier=${tier}, generations=${generationsToAdd}`);

    // Подключаемся к Supabase с сервисным ключом (обходит RLS)
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing Supabase env vars');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Ищем пользователя по email через Admin API Supabase
    const usersRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    const usersData = await usersRes.json();
    const user = usersData?.users?.[0];

    if (!user) {
      // Пользователь не зарегистрирован — сохраняем pending на 24 часа
      // Когда зарегистрируется — подтянется при loadUserBalance
      console.log('User not found for email:', email, '— saving pending payment');

      const pendingKey = `pending_payment_${email}`;
      await fetch(`${SUPABASE_URL}/rest/v1/user_balance`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          pending_email: email,
          pending_tier: tier,
          pending_generations: generationsToAdd,
          pending_at: new Date().toISOString()
        })
      });

      return res.status(200).json({ ok: true, message: 'Payment saved as pending for ' + email });
    }

    const userId = user.id;

    // Получаем текущий баланс
    const balanceRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_balance?id=eq.${userId}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const balanceData = await balanceRes.json();
    const currentBalance = balanceData?.[0];
    const currentGenerations = currentBalance?.generations_left || 0;
    const newGenerations = currentGenerations + generationsToAdd;

    // Обновляем или создаём запись баланса
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_balance`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: userId,
        email: email,
        tier: tier,
        generations_left: newGenerations,
        updated_at: new Date().toISOString()
      })
    });

    if (!upsertRes.ok) {
      const errText = await upsertRes.text();
      console.error('Supabase upsert error:', errText);
      return res.status(500).json({ error: 'Failed to update balance' });
    }

    console.log(`✅ Success: ${email} → tier=${tier}, +${generationsToAdd} gen, total=${newGenerations}`);
    return res.status(200).json({
      ok: true,
      email,
      tier,
      added: generationsToAdd,
      total: newGenerations
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
