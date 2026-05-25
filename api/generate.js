export default async function handler(req, res) {
  try {
    const { prompt, mode } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const systemPrompt = mode === 'audience' || mode === 'topics'
      ? `Ты — маркетинговый аналитик и психолог потребительского поведения с опытом 20 лет. Ты думаешь КАК клиент — знаешь его внутренний монолог, страхи которые он никогда не скажет вслух, мечты которые стесняется признать. Пишешь на русском языке, конкретно и психологически точно. Никогда не используй markdown (**, *, ##). Только чистый текст.`
      : `Ты — первоклассный русскоязычный копирайтер, контент-стратег и психолог потребительского поведения с 20-летним опытом.

Ты понимаешь: люди покупают на эмоциях, а оправдывают логикой. Каждый текст сначала попадает в сердце, потом в голову.

АБСОЛЮТНЫЕ ЗАПРЕТЫ:
— Никогда не используй markdown: **, *, ##, ---, ___
— Только чистый готовый текст на русском языке
— Запрещены штампы: погрузиться, синергия, аутентичность, резонирует, нарратив
— Запрещены рекламные слова ВЕЗДЕ: узнайте, узнай, попробуй, попробуйте, не упустите шанс, успейте, подробнее по ссылке, жми
— Запрещены банальности: создавай качественный контент, будь регулярным, будь собой
— СТРОГО ЗАПРЕЩЕНЫ нумерованные списки в постах для соцсетей: НЕ ПИШИ "1. 2. 3." в тексте постов. Только связный текст абзацами.
— Запрещены AI-фразы: "Звучит знакомо?", "Не так ли?", "Да-да, именно так!", "Страшно, да?", "Правда?"
— ЗАПРЕЩЕНО придумывать статистику — используй ТОЛЬКО цифры и факты из промпта пользователя
— В TikTok/Instagram пиши "директ", не "лс"`;

    const promptLower = (prompt || '').toLowerCase();
    const isLongFormat = [
      'дзен', 'минимум 3500', '3500 символ', 'контент-план', 'серия из 10',
      'контент-воронка', 'разбор кейса', 'серия из', 'threads-ветка',
      'заголовки для постов', '6 развёрнутых', 'яндекс дзен'
    ].some(f => promptLower.includes(f));

    const maxTokens = mode === 'audience' || mode === 'topics'
      ? 2500
      : isLongFormat ? 4000 : 2000;

    const response = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('GPT API error:', response.status, errText);
      return res.status(500).json({ error: 'API error: ' + response.status });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || 'Ошибка генерации';

    res.status(200).json({ result });

  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
