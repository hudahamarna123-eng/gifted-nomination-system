// دالة خادم (Vercel Serverless Function) — تستدعي Gemini API من جهة الخادم
// بحيث لا يظهر مفتاح API أبداً في متصفح المستخدم.
// يجب ضبط متغيّر البيئة GEMINI_API_KEY في إعدادات مشروع Vercel (وليس هنا في الكود).

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'GEMINI_API_KEY غير مضبوط على الخادم. أضِفه من إعدادات المشروع في Vercel (Environment Variables).' });
  }

  const { systemPrompt, userPrompt } = req.body || {};
  if (!userPrompt) {
    return res.status(400).json({ message: 'userPrompt مفقود' });
  }

  try {
    const geminiResponse = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: 2500,
          // نطلب من Gemini إخراج JSON صِرف مباشرة - يقلّل كثيراً من أخطاء تحليل JSON
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiResponse.ok) {
      const status = geminiResponse.status;
      let detail = '';
      try {
        const errJson = await geminiResponse.json();
        detail = errJson?.error?.message || '';
      } catch (_) {}

      if (status === 429) {
        return res.status(429).json({
          message: 'تم بلوغ الحد الأقصى المؤقت لطلبات Gemini في الدقيقة الحالية.' + (detail ? ` (${detail})` : '')
        });
      }
      return res.status(status).json({ message: detail || `فشل الاتصال بـ Gemini (رمز الحالة ${status})` });
    }

    const data = await geminiResponse.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

    if (!text) {
      return res.status(502).json({ message: 'استجابة فارغة من Gemini' });
    }

    return res.status(200).json({ text });
  } catch (error) {
    console.error('Gemini call failed:', error);
    return res.status(500).json({ message: error.message || 'خطأ غير متوقع أثناء الاتصال بـ Gemini' });
  }
}
