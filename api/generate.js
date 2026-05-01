export default async function handler(req, res) {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const response = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        // Чтобы переключиться на gpt-4o — просто замени строку выше на:
        // model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `Ты — лучший русскоязычный SMM-копирайтер и контент-стратег. 
Твои тексты читают, сохраняют и пересылают. 
Ты пишешь живо, конкретно, без воды и клише.
Каждый текст — готов к публикации без редактирования.
Никогда не используй markdown-форматирование (**, *, ##, ---).
Никогда не пиши технические блоки, самопроверки или комментарии о своей работе.
Только чистый готовый контент.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.85,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ProxyAPI error:', response.status, errText);
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
