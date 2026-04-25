export default async function handler(req, res) {
  try {
    const { prompt } = req.body;

    const response = await fetch("https://api.proxyapi.ru/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.PROXY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    res.status(200).json({
      result: data.choices?.[0]?.message?.content || "Ошибка генерации"
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
