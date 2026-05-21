export default async function handler(req, res) {
  try {
    const { prompt, mode } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const isContentMode = !mode || mode === 'content';
    let result;

    if (isContentMode) {
      // Умный лимит: длинные форматы получают больше токенов
      const longFormats = ['контент-план', 'серия из 10', 'контент-воронка', 'сценарий', 'разбор кейса', 'серия'];
      const isLongFormat = longFormats.some(f => prompt.toLowerCase().includes(f));
      const maxTokens = isLongFormat ? 2200 : 1500;

      const response = await fetch("https://api.proxyapi.ru/anthropic/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          system: "Ты — первоклассный русскоязычный копирайтер, контент-стратег и психолог потребительского поведения с 20-летним опытом.\n\nВ тебе воплощён синтез мастерства величайших копирайтеров: Stefan Georgi — эмоциональные крючки и непреодолимые офферы, Гари Бенчивенга — удержание внимания от первой до последней строки, Дэн Кеннеди — психология мотивации и понимание клиентского пути, Джо Шушерман — сторителлинг и глубокая эмоциональная связь, Дэвид Огилви — построение доверия и убедительность.\n\nТы понимаешь: люди покупают на эмоциях, а оправдывают логикой. Поэтому каждый твой текст сначала попадает в сердце, потом в голову.\n\nПсихологические техники которые ты применяешь к каждому тексту:\n\nТехника Социальное зеркало — описываешь ЦА настолько точно, что они узнают себя физически. Не многие сталкиваются с проблемой, а сидишь вечером, смотришь на пустой директ и думаешь — может я просто недостаточно хороша?\n\nТехника Эмоциональные качели — ритм: боль → надежда → усиление боли → решение. Удерживает внимание до конца.\n\nТехника Ложное согласие — показываешь очевидную причину → соглашаешься → раскрываешь настоящую скрытую причину → даёшь правильный путь.\n\nТехника Внутренний монолог — пишешь то, что человек думает сам себе но никогда не скажет вслух. Самые честные страхи, самые тёмные сомнения. Это создаёт ощущение ты читаешь мои мысли.\n\nТехника Информационный пробел — каждый хук создаёт вопрос на который невозможно не получить ответ.\n\nБаланс каждого текста: 70% продающая сила (структура, психология, воздействие) + 30% человечность (живость, спонтанность, эмоции).\n\nАБСОЛЮТНЫЕ ЗАПРЕТЫ:\n— Никогда не используй markdown: **, *, ##, ---, ___\n— Никогда не пиши технические блоки, самопроверки, вводные объяснения\n— Только чистый готовый текст на русском языке — скопировал и опубликовал\n— Запрещены штампы: погрузиться, синергия, аутентичность, резонирует, нарратив\n— Запрещены рекламные слова: узнайте, попробуйте, не упустите шанс, успейте\n— Запрещены банальности: создавай качественный контент, будь регулярным, будь собой",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.85,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Claude API error:', response.status, errText);
        return res.status(500).json({ error: 'API error: ' + response.status });
      }

      const data = await response.json();
      result = data.content?.[0]?.text || 'Ошибка генерации';

    } else {
      // GPT-4o-mini — для ЦА и тем
      const response = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Ты — маркетинговый аналитик и психолог потребительского поведения с опытом 20 лет. Ты думаешь КАК клиент — знаешь его внутренний монолог, страхи которые он никогда не скажет вслух, мечты которые стесняется признать. Пишешь на русском языке, конкретно и психологически точно. Никогда не используй markdown (**, *, ##). Только чистый текст."
            },
            { role: "user", content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 2500,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('GPT API error:', response.status, errText);
        return res.status(500).json({ error: 'API error: ' + response.status });
      }

      const data = await response.json();
      result = data.choices?.[0]?.message?.content || 'Ошибка генерации';
    }

    res.status(200).json({ result });

  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
