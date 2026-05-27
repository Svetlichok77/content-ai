export default async function handler(req, res) {
  try {
    const { prompt, mode, userId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

    // ============================================================
    // СЕРВЕРНАЯ ПРОВЕРКА БАЛАНСА
    // ============================================================
    if (userId && SUPABASE_URL && SUPABASE_KEY && !prompt.includes('__TEST_MODE__')) {
      try {
        const balanceRes = await fetch(
          `${SUPABASE_URL}/rest/v1/user_balance?id=eq.${userId}&select=generations_left,tier`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          const row = balanceData?.[0];
          if (row) {
            const currentLeft = row.generations_left || 0;
            if (currentLeft <= 0) {
              return res.status(402).json({ error: 'NO_GENERATIONS', message: 'Генерации закончились' });
            }
            await fetch(`${SUPABASE_URL}/rest/v1/user_balance?id=eq.${userId}`, {
              method: 'PATCH',
              headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ generations_left: currentLeft - 1, updated_at: new Date().toISOString() })
            });
          }
        }
      } catch(balanceErr) {
        console.error('Balance check error:', balanceErr.message);
      }
    }

    // ============================================================
    // МАРШРУТИЗАЦИЯ МОДЕЛЕЙ
    // Настройка (поиск ЦА, тем, контент-план) → GPT-4o-mini (дёшево)
    // Готовый контент (посты, пины, сценарии) → Claude Haiku (качество)
    // ============================================================
    const isSetupMode = mode === 'audience' || mode === 'topics';
    const useHaiku = !isSetupMode; // контент → Claude Haiku

    const systemPrompt = isSetupMode
      ? `Ты — маркетинговый аналитик и психолог потребительского поведения с опытом 20 лет. Ты думаешь КАК клиент — знаешь его внутренний монолог, страхи которые он никогда не скажет вслух, мечты которые стесняется признать. Пишешь на русском языке, конкретно и психологически точно. Никогда не используй markdown (**, *, ##). Только чистый текст.`
      : `Ты — первоклассный русскоязычный копирайтер, контент-стратег и психолог потребительского поведения с 20-летним опытом.

Ты понимаешь: люди покупают на эмоциях, а оправдывают логикой. Каждый текст сначала попадает в сердце, потом в голову.

АБСОЛЮТНЫЕ ЗАПРЕТЫ:
— Никогда не используй markdown: **, *, ##, ---, ___
— Только чистый готовый текст на русском языке
— Запрещены штампы и клише: погрузиться, синергия, аутентичность, резонирует, нарратив
— ЗАПРЕЩЕНЫ нейросеточные фразы: "на самом деле", "ты не одна", "решение ближе чем кажется", "сделай шаг", "инвестиция в будущее", "разве не стоит этого", "вернуть искру", "наладить общение", "глубокое понимание", "в разгар кризиса", "именно то что тебе нужно", "ты заслуживаешь лучшего", "просто попробуй"
— ОБЯЗАТЕЛЬНО: в каждом посте одна конкретная экспертная мысль-инсайт. Не эмоция, а наблюдение. Пример: "Конфликт начинается не с темы разговора, а с чувства что тебя не слышат" — вот это экспертно.
— Запрещены рекламные слова ВЕЗДЕ: узнайте, узнай, попробуй, попробуйте, не упустите шанс, успейте
— СТРОГО ЗАПРЕЩЕНЫ нумерованные списки в постах: НЕ ПИШИ "1. 2. 3." в тексте постов. Только связный текст абзацами.
— Запрещены AI-фразы: "Звучит знакомо?", "Не так ли?", "Да-да, именно так!"
— ЗАПРЕЩЕНО придумывать статистику — только факты из промпта
— В TikTok/Instagram пиши "директ", не "лс"`;

    const promptLower = (prompt || '').toLowerCase();
    const isLongFormat = [
      'дзен', 'минимум 3500', '3500 символ', 'контент-план', 'серия из 10',
      'контент-воронка', 'разбор кейса', 'серия из', 'threads-ветка',
      'заголовки для постов', '6 развёрнутых', 'яндекс дзен'
    ].some(f => promptLower.includes(f));

    const maxTokens = isSetupMode ? 2500 : isLongFormat ? 4000 : 2000;

    let result;

    if (useHaiku) {
      // ============================================================
      // CLAUDE HAIKU — для готового контента (посты, пины, сценарии)
      // ============================================================
      const haikuRes = await fetch("https://api.proxyapi.ru/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.85,
        }),
      });

      if (!haikuRes.ok) {
        // Если Haiku недоступен — fallback на GPT-4o-mini
        console.warn('Haiku unavailable, falling back to GPT-4o-mini');
        const fallbackRes = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.PROXY_API_KEY}` },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }], temperature: 0.85, max_tokens: maxTokens }),
        });
        const fallbackData = await fallbackRes.json();
        result = fallbackData.choices?.[0]?.message?.content || 'Ошибка генерации';
      } else {
        const haikuData = await haikuRes.json();
        result = haikuData.content?.[0]?.text || 'Ошибка генерации';
      }

    } else {
      // ============================================================
      // GPT-4o-mini — для настройки (поиск ЦА, тем, контент-план)
      // ============================================================
      const gptRes = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.PROXY_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
          temperature: 0.85,
          max_tokens: maxTokens,
        }),
      });

      if (!gptRes.ok) {
        const errText = await gptRes.text();
        console.error('GPT API error:', gptRes.status, errText);
        return res.status(500).json({ error: 'API error: ' + gptRes.status });
      }

      const gptData = await gptRes.json();
      result = gptData.choices?.[0]?.message?.content || 'Ошибка генерации';
    }

    res.status(200).json({ result });

  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
