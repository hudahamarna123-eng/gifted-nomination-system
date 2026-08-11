// دالة خادم لتخزين واسترجاع سجل التقييمات، مشتركاً بين كل المعلمين.
// تستخدم Upstash Redis (تكامل مجاني متوفر مباشرة من متجر تكاملات Vercel).
// عند إضافة تكامل Upstash Redis من لوحة Vercel، يتم ضبط UPSTASH_REDIS_REST_URL
// و UPSTASH_REDIS_REST_TOKEN تلقائياً كمتغيّرات بيئة - لا حاجة لإدخالهما يدوياً.

import { Redis } from '@upstash/redis';

const REPORTS_KEY = 'gifted_assessments';

export default async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({
      message: 'لم يتم ضبط قاعدة البيانات (Upstash Redis) بعد. أضِف تكامل Upstash Redis من متجر تكاملات Vercel أولاً.'
    });
  }

  const redis = new Redis({ url, token });

  try {
    if (req.method === 'GET') {
      const reports = (await redis.get(REPORTS_KEY)) || [];
      return res.status(200).json({ reports });
    }

    if (req.method === 'POST') {
      const { reports } = req.body || {};
      if (!Array.isArray(reports)) {
        return res.status(400).json({ message: 'صيغة البيانات غير صحيحة' });
      }
      await redis.set(REPORTS_KEY, reports);
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Reports storage error:', error);
    return res.status(500).json({ message: error.message || 'خطأ غير متوقع في قاعدة البيانات' });
  }
}

