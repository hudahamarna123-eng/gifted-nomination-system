import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, PieChart, Pie, Cell
} from 'recharts';
import { 
  BrainCircuit, Users, FileText, LayoutDashboard, PlusCircle, Printer, Save, Search, 
  AlertCircle, CheckCircle2, ChevronRight, Loader2, Trash2
} from 'lucide-react';

// --- Persistence key ---
// كل التقارير تُحفظ في مفتاح واحد مشترك بحيث يقدر أي معلم يرجع لأي تقرير سابق
const REPORTS_KEY = 'assessments';

// --- Constants & Data Structures ---
const ASSESSMENT_AXES = {
  mental: {
    id: 'mental',
    title: 'القدرات العقلية',
    questions: [
      'سرعة الفهم واستيعاب المفاهيم المعقدة.',
      'التفكير المنطقي وربط الأسباب بالنتائج.',
      'القدرة على حل المشكلات بطرق متعددة.',
      'القدرة العالية على الاستنتاج والتحليل.',
      'الربط السريع بين الأفكار المختلفة.'
    ]
  },
  creativity: {
    id: 'creativity',
    title: 'الإبداع',
    questions: [
      'يقدم أفكاراً جديدة وغير مألوفة.',
      'يستخدم أكثر من طريقة للوصول إلى الحل.',
      'يظهر شغفاً وحباً للابتكار والتجربة.',
      'يتخيل حلولاً غير تقليدية للمواقف العادية.',
      'يتمتع بخيال واسع وقدرة على التطوير.'
    ]
  },
  learning: {
    id: 'learning',
    title: 'التعلم',
    questions: [
      'يتعلم المهارات والمفاهيم الجديدة بسرعة.',
      'يتذكر المعلومات والتفاصيل لفترة طويلة.',
      'يحتاج إلى شرح وتكرار أقل من أقرانه.',
      'يربط المعرفة السابقة بالمعلومات الجديدة بسهولة.',
      'يظهر حصيلة لغوية أو معرفية تفوق عمره.'
    ]
  },
  leadership: {
    id: 'leadership',
    title: 'القيادة',
    questions: [
      'يؤثر في زملائه ويوجههم إيجابياً.',
      'يبادر باقتراح الأفكار وتولي المهام.',
      'يتحمل المسؤولية في المهام الموكلة إليه.',
      'يعمل بفعالية وتناغم ضمن الفريق.',
      'يستطيع تنظيم وتوزيع الأدوار بين زملائه.'
    ]
  },
  motivation: {
    id: 'motivation',
    title: 'الدافعية',
    questions: [
      'يظهر فضولاً علمياً ورغبة في المعرفة.',
      'يطرح أسئلة كثيرة ومتعمقة حول المواضيع.',
      'يحب الاستكشاف والبحث عن المعلومات.',
      'لديه دافع قوي للتعلم الذاتي خارج المنهج.',
      'يستمر في العمل على المهام الصعبة دون إحباط.'
    ]
  },
  achievement: {
    id: 'achievement',
    title: 'الإنجاز',
    questions: [
      'يحرص على المشاركة في المسابقات والأنشطة.',
      'يبدع في إنجاز المشاريع المدرسية.',
      'لديه إنجازات ملموسة (شهادات، أعمال، نماذج).',
      'يظهر أداءً أكاديمياً متميزاً في المادة.',
      'يسعى دائماً لإتقان العمل وتقديمه بأفضل صورة.'
    ]
  }
};

const RATING_SCALE = [
  { value: 1, label: 'لا ينطبق إطلاقاً' },
  { value: 2, label: 'ينطبق قليلاً' },
  { value: 3, label: 'ينطبق أحياناً' },
  { value: 4, label: 'ينطبق غالباً' },
  { value: 5, label: 'ينطبق بدرجة كبيرة' }
];

const REQUIRED_REPORT_FIELDS = [
  'nomination_level', 'ai_interpretation', 'strengths', 'areas_for_improvement',
  'reasons_for_nomination', 'teacher_recommendations', 'parent_recommendations',
  'suggested_activities', 'follow_up_plan'
];

// يحاول استخراج كائن JSON من نص قد يحتوي أسوار ماركداون أو نصاً زائداً حوله
const parseReportJSON = (rawText) => {
  let text = (rawText || '').trim();
  text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('لم يتم العثور على كائن JSON في رد الذكاء الاصطناعي (قد يكون الرد غير مكتمل)');
  }
  text = text.slice(firstBrace, lastBrace + 1);

  // إصلاحات شائعة تكسر JSON.parse رغم أن الشكل العام سليم:
  // 1) أسطر جديدة/تابات خام داخل النص (غير مسموحة داخل سلاسل JSON حسب المعيار)
  text = text.replace(/\r\n|\r|\n|\t/g, ' ');
  // 2) فواصل زائدة قبل إغلاق قوس أو مصفوفة: { "a": 1, } أو [1, 2, ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('رد الذكاء الاصطناعي لم يكن بصيغة JSON صالحة: ' + e.message);
  }
};

const isReportShapeValid = (obj) =>
  !!obj && REQUIRED_REPORT_FIELDS.every((f) => obj[f] !== undefined && obj[f] !== null);

const callClaudeForReport = async (systemPrompt, userPrompt) => {
  // بدل الاتصال المباشر بأي مزوّد ذكاء اصطناعي من المتصفح (غير آمن لأنه يكشف المفتاح)،
  // نستدعي دالة الخادم الخاصة بنا التي تتصل بـ Gemini API بأمان من جهة الخادم.
  const response = await fetch('/api/generate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userPrompt })
  });

  if (!response.ok) {
    let errBody = null;
    try { errBody = await response.json(); } catch (_) {}

    if (response.status === 429) {
      const err = new Error(
        errBody?.message || 'تم بلوغ الحد الأقصى المؤقت لاستخدام خدمة الذكاء الاصطناعي. حاول خلال دقيقة.'
      );
      err.isRateLimit = true;
      throw err;
    }

    const detail = errBody?.message ? ` - ${errBody.message}` : '';
    throw new Error(`فشل الاتصال بخدمة الذكاء الاصطناعي (رمز الحالة ${response.status})${detail}`);
  }

  const data = await response.json();
  if (!data.text) throw new Error('استجابة فارغة من الذكاء الاصطناعي');
  return data.text;
};

const generateAIReport = async (studentData, assessmentScores) => {
  // Calculate averages to guide the AI
  const averages = {};
  let totalScore = 0;
  let maxPossibleScore = 0;

  Object.keys(ASSESSMENT_AXES).forEach(axisKey => {
    const scores = assessmentScores[axisKey] || [];
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = scores.length > 0 ? (sum / scores.length).toFixed(2) : 0;
    averages[ASSESSMENT_AXES[axisKey].title] = parseFloat(avg);
    totalScore += sum;
    maxPossibleScore += scores.length * 5;
  });

  const overallPercentage = ((totalScore / maxPossibleScore) * 100).toFixed(1);

  const systemPrompt = `أنت خبير تربوي متخصص في رعاية الموهوبين. مهمتك تحليل نتائج تقييم مبدئي لطالب.
مهم جداً: لا تستخدم كلمة "موهوب" كتشخيص نهائي، استخدم مصطلح "مرشح" أو "يظهر سمات". هذا مؤشر أولي فقط.
أعد ردك ككائن JSON واحد فقط، مختصر، مكتمل، وصالح للتحليل البرمجي مباشرة، بدون أي نص قبله أو بعده وبدون علامات ماركداون.
التزم حرفياً بعدد العناصر المطلوب في كل مصفوفة، واجعل كل عبارة قصيرة (لا تتجاوز 10 كلمات) حتى يبقى الرد كاملاً ومختصراً.`;

  const baseUserPrompt = `بيانات الطالب:
- الاسم: ${studentData.name}
- الصف: ${studentData.grade} (${studentData.section})
- العمر: ${studentData.age}
- المادة: ${studentData.subject}
- درجات الاختبارات المدرسية: ${studentData.schoolTests || 'غير متوفر'}
- درجات الاختبارات المعيارية: ${studentData.standardizedTests || 'غير متوفر'}

متوسط درجات التقييم (من 5) بناءً على إجابات المعلم:
${Object.entries(averages).map(([title, avg]) => `- ${title}: ${avg}/5`).join('\n')}
النسبة العامة: ${overallPercentage}%

حلل الطالب بإيجاز شديد وأعد كائن JSON بالضبط بهذا الشكل ولا شيء غيره (لا تزد عن العدد المطلوب من العناصر):
{
  "nomination_level": "اختر واحدة حرفياً: مرشح بقوة لبرامج الموهوبين / مرشح بدرجة متوسطة ويحتاج إلى أدوات تقييم إضافية / يحتاج إلى ملاحظات إضافية قبل اتخاذ قرار",
  "ai_interpretation": "تفسير تربوي في جملتين فقط يربط بين المحاور",
  "strengths": ["نقطة قوة 1", "نقطة قوة 2", "نقطة قوة 3"],
  "areas_for_improvement": ["نقطة 1", "نقطة 2"],
  "reasons_for_nomination": ["مبرر 1", "مبرر 2"],
  "teacher_recommendations": ["توصية 1", "توصية 2"],
  "parent_recommendations": ["توصية 1", "توصية 2"],
  "suggested_activities": ["نشاط 1", "نشاط 2", "نشاط 3"],
  "follow_up_plan": "جملة أو جملتان لخطة متابعة لمدة 3 أشهر"
}`;

  const MAX_ATTEMPTS = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const promptForAttempt = attempt === 1
        ? baseUserPrompt
        : `${baseUserPrompt}\n\nملاحظة مهمة: المحاولة السابقة فشلت لأن الرد لم يكن كائن JSON واحداً مكتملاً وصالحاً. اختصر العبارات أكثر والتزم بعدد العناصر المطلوب بالضبط، وتأكد أن الرد يبدأ بـ { وينتهي بـ } بدون أي نص آخر.`;

      const rawText = await callClaudeForReport(systemPrompt, promptForAttempt);
      const parsed = parseReportJSON(rawText);
      if (!isReportShapeValid(parsed)) {
        throw new Error('رد الذكاء الاصطناعي لا يحتوي كل الحقول المطلوبة');
      }
      return { ...parsed, averages, overallPercentage };
    } catch (error) {
      console.error(`AI Generation attempt ${attempt} failed:`, error);
      lastError = error;
      // لا فائدة من إعادة المحاولة إذا كان السبب انتهاء حصة الاستخدام - نفس النتيجة ستتكرر فوراً
      if (error.isRateLimit) break;
    }
  }

  throw lastError || new Error('تعذر توليد التقرير');
};

// --- Persistence helpers (خادمنا الخاص + قاعدة بيانات مشتركة، بدل window.storage الخاص بـ Claude) ---
const loadAllReports = async () => {
  try {
    const response = await fetch('/api/reports');
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.reports) ? data.reports : [];
  } catch (e) {
    return [];
  }
};

const saveAllReports = async (reportsArray) => {
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reports: reportsArray })
  });
  if (!response.ok) throw new Error('فشل حفظ البيانات');
  return response.json();
};

export default function GiftedNominationSystem() {
  const [activeTab, setActiveTab] = useState('new'); // 'new', 'dashboard', 'history'
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [loadError, setLoadError] = useState(false);
  
  // Assessment Form State
  const [currentStep, setCurrentStep] = useState(1); // 1: Info, 2: Assessment, 3: Generating, 4: Result
  const [studentInfo, setStudentInfo] = useState({
    name: '', studentId: '', grade: '', section: '', age: '', gender: 'ذكر', teacherName: '', subject: '', schoolTests: '', standardizedTests: ''
  });
  const [scores, setScores] = useState({});
  const [generatedReport, setGeneratedReport] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // حالة سجل التقييمات (يجب أن تكون على مستوى المكوّن الرئيسي وليس داخل دالة عرض تُستدعى بشرط،
  // لأن استدعاء useState داخل دالة تُنفَّذ بشرط فقط عند تبويب "سجل التقييمات" يخالف قواعد الـ Hooks
  // ويسبب صفحة فارغة عند فتح السجل)
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyGradeFilter, setHistoryGradeFilter] = useState('');
  const [historySubjectFilter, setHistorySubjectFilter] = useState('');
  const [selectedHistoryReport, setSelectedHistoryReport] = useState(null);

  // Modal State for avoiding native alerts/confirms
  const [modal, setModal] = useState({ isOpen: false, type: '', message: '', onConfirm: null });

  // --- Load saved reports from persistent storage on first load ---
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const fetched = await loadAllReports();
        // ترتيب تنازلي حسب التاريخ (الأحدث أولاً)
        fetched.sort((a, b) => {
          const timeA = a.date ? new Date(a.date).getTime() : 0;
          const timeB = b.date ? new Date(b.date).getTime() : 0;
          return timeB - timeA;
        });
        setReports(fetched);
      } catch (error) {
        console.error("Error loading reports:", error);
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleInfoChange = (e) => {
    setStudentInfo({ ...studentInfo, [e.target.name]: e.target.value });
  };

  const handleScoreChange = (axisId, questionIndex, value) => {
    setScores(prev => {
      const newScores = { ...prev };
      if (!newScores[axisId]) {
        newScores[axisId] = new Array(ASSESSMENT_AXES[axisId].questions.length).fill(0);
      }
      newScores[axisId][questionIndex] = value;
      return newScores;
    });
  };

  const isInfoValid = () => {
    return studentInfo.name && studentInfo.grade && studentInfo.teacherName;
  };

  const isAssessmentComplete = () => {
    for (const axisKey in ASSESSMENT_AXES) {
      if (!scores[axisKey] || scores[axisKey].length !== ASSESSMENT_AXES[axisKey].questions.length) return false;
      if (scores[axisKey].includes(0)) return false;
    }
    return true;
  };

  const handleSubmitAssessment = async () => {
    setCurrentStep(3); // Loading step
    try {
      const report = await generateAIReport(studentInfo, scores);
      const reportPayload = {
        id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        student: studentInfo,
        scores: scores,
        aiData: report,
        date: new Date().toISOString()
      };
      setGeneratedReport(reportPayload);
      setCurrentStep(4); // Result step

      // الحفظ التلقائي في سجل التقييمات بمجرد صدور التقرير
      setIsSaving(true);
      try {
        const updated = [reportPayload, ...reports];
        await saveAllReports(updated);
        setReports(updated);
        setSaveSuccess(true);
      } catch (error) {
        console.error("Error auto-saving report:", error);
      } finally {
        setIsSaving(false);
      }
    } catch (error) {
      console.error('Report generation failed after all attempts:', error);
      if (error?.isRateLimit) {
        setModal({
          isOpen: true,
          type: 'error',
          message: `⏳ ${error.message}\n\nهذا ازدحام مؤقت على خدمة الذكاء الاصطناعي، وليس خطأ في بياناتك. عادة ما يزول خلال دقيقة أو دقيقتين - يرجى المحاولة مجدداً.`
        });
      } else {
        const reason = error?.message ? `\n(السبب: ${error.message})` : '';
        setModal({
          isOpen: true,
          type: 'error',
          message: `حدث خطأ أثناء توليد التقرير. يرجى المحاولة مرة أخرى.${reason}`
        });
      }
      setCurrentStep(2);
    }
  };

  const saveReportToDatabase = async () => {
    if (!generatedReport) return;
    // إذا كان محفوظاً بالفعل (الحفظ التلقائي) لا داعي للتكرار
    if (reports.some(r => r.id === generatedReport.id)) {
      setSaveSuccess(true);
      return;
    }
    setIsSaving(true);
    try {
      const updated = [generatedReport, ...reports];
      await saveAllReports(updated);
      setReports(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving report:", error);
      setModal({ isOpen: true, type: 'error', message: 'حدث خطأ أثناء الحفظ.' });
    } finally {
      setIsSaving(false);
    }
  };

  // تنزيل التقرير كملف HTML مستقل يحتفظ بنفس التنسيق (بما فيه الرسم البياني)،
  // يقدر المعلم يفتحه أو يطبعه لاحقاً كـ PDF من متصفحه.
  // نعتمد هذه الطريقة بدل الاعتماد فقط على window.print() لأن بعض بيئات العرض
  // تمنع نافذة الطباعة، بينما تنزيل الملف مباشرة يعمل دائماً.
  const handleDownloadReport = (reportData) => {
    const container = document.getElementById('report-container');
    if (!container) {
      setModal({ isOpen: true, type: 'error', message: 'تعذر العثور على محتوى التقرير للتحميل. حاول مرة أخرى.' });
      return;
    }

    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('.no-print').forEach((el) => el.remove());

      const studentName = reportData?.student?.name || 'تقرير';
      const dateStr = reportData?.date
        ? new Date(reportData.date).toLocaleDateString('ar-EG')
        : new Date().toLocaleDateString('ar-EG');

      const htmlDoc = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>تقرير ترشيح - ${studentName}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  body { font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background:#f8fafc; margin:0; padding:24px; }
  @media print { body { background: white !important; padding: 0; } }
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>`;

      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `تقرير-${studentName}-${dateStr}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      console.error('Download error:', error);
      setModal({ isOpen: true, type: 'error', message: 'حدث خطأ أثناء تنزيل التقرير. حاول مرة أخرى.' });
    }
  };

  const resetForm = () => {
    setStudentInfo({ name: '', studentId: '', grade: '', section: '', age: '', gender: 'ذكر', teacherName: '', subject: '', schoolTests: '', standardizedTests: '' });
    setScores({});
    setGeneratedReport(null);
    setCurrentStep(1);
    setActiveTab('new');
  };

  const handleDeleteReport = (id) => {
    setModal({
      isOpen: true,
      type: 'confirm',
      message: 'هل أنت متأكد من مسح هذا التقرير نهائياً؟ (هذا الإجراء مخصص للإدارة ولا يمكن التراجع عنه)',
      onConfirm: async () => {
        try {
          const updated = reports.filter(r => r.id !== id);
          await saveAllReports(updated);
          setReports(updated);
          setModal({ isOpen: false });
        } catch (error) {
          setModal({ isOpen: true, type: 'error', message: 'حدث خطأ أثناء الحذف.' });
        }
      }
    });
  };

  const renderInfoStep = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 fade-in">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Users className="w-6 h-6 text-indigo-600" />
        البيانات الأساسية للطالب
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم الطالب رباعياً *</label>
          <input type="text" name="name" value={studentInfo.name} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الرقم المدرسي (اختياري)</label>
          <input type="text" name="studentId" value={studentInfo.studentId} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الصف *</label>
          <select name="grade" value={studentInfo.grade} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required>
            <option value="">اختر الصف...</option>
            <option value="الأول">الأول</option>
            <option value="الثاني">الثاني</option>
            <option value="الثالث">الثالث</option>
            <option value="الرابع">الرابع</option>
            <option value="الخامس">الخامس</option>
            <option value="السادس">السادس</option>
            <option value="السابع">السابع</option>
            <option value="الثامن">الثامن</option>
            <option value="التاسع">التاسع</option>
            <option value="العاشر">العاشر</option>
            <option value="الحادي عشر">الحادي عشر</option>
            <option value="الثاني عشر">الثاني عشر</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الشعبة</label>
          <input type="text" name="section" value={studentInfo.section} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">العمر</label>
          <input type="number" name="age" value={studentInfo.age} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الجنس</label>
          <select name="gender" value={studentInfo.gender} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="ذكر">ذكر</option>
            <option value="أنثى">أنثى</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم المعلم المقيم *</label>
          <input type="text" name="teacherName" value={studentInfo.teacherName} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">المادة الدراسية</label>
          <input type="text" name="subject" value={studentInfo.subject} onChange={handleInfoChange} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">درجة الاختبارات المدرسية (إن وجدت)</label>
          <input type="text" name="schoolTests" value={studentInfo.schoolTests} onChange={handleInfoChange} placeholder="مثال: 98%" className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">درجة الاختبارات المعيارية (إن وجدت)</label>
          <input type="text" name="standardizedTests" value={studentInfo.standardizedTests} onChange={handleInfoChange} placeholder="مقياس موهبة، قدرات..." className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
      </div>
      <div className="mt-8 flex justify-end">
        <button 
          onClick={() => setCurrentStep(2)} 
          disabled={!isInfoValid()}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          التالي <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
      </div>
    </div>
  );

  const renderAssessmentStep = () => (
    <div className="space-y-8 fade-in">
      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="font-semibold text-indigo-900">تعليمات التقييم</h3>
          <p className="text-sm text-indigo-800 mt-1">
            يرجى قراءة كل عبارة بدقة واختيار الدرجة التي تعكس واقع الطالب بموضوعية. 
            المقياس: 1 (لا ينطبق) إلى 5 (ينطبق بدرجة كبيرة).
          </p>
        </div>
      </div>

      {Object.entries(ASSESSMENT_AXES).map(([axisKey, axis], axisIndex) => (
        <div key={axisKey} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center text-sm">
              {axisIndex + 1}
            </span>
            {axis.title}
          </h2>
          <div className="space-y-6">
            {axis.questions.map((question, qIndex) => (
              <div key={qIndex} className="bg-slate-50 p-4 rounded-lg">
                <p className="text-slate-800 font-medium mb-3">{qIndex + 1}. {question}</p>
                <div className="flex flex-wrap gap-2">
                  {RATING_SCALE.map((scale) => {
                    const isSelected = scores[axisKey]?.[qIndex] === scale.value;
                    return (
                      <button
                        key={scale.value}
                        onClick={() => handleScoreChange(axisKey, qIndex, scale.value)}
                        className={`flex-1 min-w-[100px] py-2 px-1 text-sm rounded-md border transition-all ${
                          isSelected 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <div className="font-bold text-lg mb-1">{scale.value}</div>
                        <div className="text-xs">{scale.label}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 sticky bottom-4 z-10">
        <button 
          onClick={() => setCurrentStep(1)} 
          className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          رجوع
        </button>
        <button 
          onClick={handleSubmitAssessment} 
          disabled={!isAssessmentComplete()}
          className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg transition-all"
        >
          <BrainCircuit className="w-5 h-5" />
          تحليل الإجابات وإصدار التقييم
        </button>
      </div>
    </div>
  );

  const renderLoadingStep = () => (
    <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center min-h-[400px] fade-in">
      <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
      <h2 className="text-2xl font-bold text-slate-800 mb-2">جاري تحليل البيانات...</h2>
      <p className="text-slate-500 text-center max-w-md">
        يقوم الذكاء الاصطناعي الآن بقراءة إجاباتك، تحليل الأنماط، ومقارنة المحاور لبناء تقرير تربوي متكامل مخصص للطالب.
      </p>
    </div>
  );

  const renderReportStep = (reportData = generatedReport, isHistoryView = false) => {
    if (!reportData) return null;
    const { student, aiData, date } = reportData;

    // Prepare data for Radar Chart
    const radarData = Object.entries(aiData.averages).map(([subject, value]) => ({
      subject,
      'التقييم': value,
      fullMark: 5,
    }));

    // Determine color based on nomination level
    let levelColor = 'text-slate-800';
    let levelBg = 'bg-slate-100';
    if (aiData.nomination_level.includes('بقوة')) { levelColor = 'text-emerald-700'; levelBg = 'bg-emerald-100'; }
    else if (aiData.nomination_level.includes('متوسطة')) { levelColor = 'text-amber-700'; levelBg = 'bg-amber-100'; }
    else { levelColor = 'text-blue-700'; levelBg = 'bg-blue-100'; }

    return (
      <div className="space-y-6 fade-in printable-report" id="report-container">
        {/* Header Actions (Not printed) */}
        <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 no-print">
          {!isHistoryView ? (
            <button onClick={() => setCurrentStep(2)} className="text-slate-600 hover:text-indigo-600 flex items-center gap-1">
              <ChevronRight className="w-4 h-4" /> تعديل التقييم
            </button>
          ) : (
            <div className="text-slate-500 text-sm font-medium">عرض التقرير المحفوظ</div>
          )}
          <div className="flex gap-3">
            <button 
              onClick={() => handleDownloadReport(reportData)} 
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              title="ينزّل التقرير كملف يمكن فتحه أو طباعته لاحقاً"
            >
              <Printer className="w-4 h-4" /> تنزيل التقرير
            </button>
            <button 
              onClick={() => window.print()} 
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-2"
              title="فتح نافذة الطباعة مباشرة"
            >
              <Printer className="w-4 h-4" /> طباعة
            </button>
            {!isHistoryView && (
              <button 
                onClick={saveReportToDatabase}
                disabled={isSaving || saveSuccess}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white transition-colors ${
                  saveSuccess ? 'bg-emerald-500' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {saveSuccess ? <><CheckCircle2 className="w-4 h-4" /> تم الحفظ في السجل تلقائياً</> : <><Save className="w-4 h-4" /> {isSaving ? 'جاري الحفظ...' : 'حفظ التقرير'}</>}
              </button>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 report-page">
          {/* Header */}
          <div className="border-b-2 border-indigo-600 pb-6 mb-8 text-center">
            <h2 className="text-xl font-bold text-slate-800">مدرسة السلف الصالح الخاصة</h2>
            <p className="text-slate-500 text-sm mb-4">قسم الدمج</p>
            <h1 className="text-3xl font-bold text-slate-800 mb-2">تقرير ترشيح مبدئي لبرامج الموهوبين</h1>
            <p className="text-slate-500">نظام الذكاء الاصطناعي للتحليل التربوي</p>
          </div>

          {/* Student Info Card */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 mb-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-slate-500 block mb-1">الاسم:</span><span className="font-bold text-slate-800">{student.name}</span></div>
            <div><span className="text-slate-500 block mb-1">الرقم المدرسي:</span><span className="font-bold text-slate-800">{student.studentId || '-'}</span></div>
            <div><span className="text-slate-500 block mb-1">الصف:</span><span className="font-bold text-slate-800">{student.grade} {student.section}</span></div>
            <div><span className="text-slate-500 block mb-1">العمر / الجنس:</span><span className="font-bold text-slate-800">{student.age} / {student.gender}</span></div>
            <div><span className="text-slate-500 block mb-1">المعلم المقيم:</span><span className="font-bold text-slate-800">{student.teacherName}</span></div>
            <div><span className="text-slate-500 block mb-1">المادة:</span><span className="font-bold text-slate-800">{student.subject || '-'}</span></div>
            <div><span className="text-slate-500 block mb-1">الاختبارات المدرسية:</span><span className="font-bold text-slate-800">{student.schoolTests || '-'}</span></div>
            <div><span className="text-slate-500 block mb-1">الاختبارات المعيارية:</span><span className="font-bold text-slate-800">{student.standardizedTests || '-'}</span></div>
            <div><span className="text-slate-500 block mb-1">تاريخ التقييم:</span><span className="font-bold text-slate-800">{new Date(date).toLocaleDateString('ar-EG')}</span></div>
            <div><span className="text-slate-500 block mb-1">النسبة العامة:</span><span className="font-bold text-indigo-600 text-lg">{aiData.overallPercentage}%</span></div>
          </div>

          {/* Nomination Level Banner */}
          <div className={`p-4 rounded-xl mb-8 text-center border ${levelBg} border-${levelColor.split('-')[1]}-200`}>
            <h2 className={`text-xl font-bold ${levelColor}`}>نتيجة الترشيح: {aiData.nomination_level}</h2>
            <p className={`text-sm mt-1 opacity-80 ${levelColor}`}>
              * ملاحظة: هذه النتيجة تمثل مؤشراً أولياً بناءً على تقييم المعلم ولا تعتبر تشخيصاً نهائياً.
            </p>
          </div>

          {/* AI Interpretation & Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-indigo-600" /> تحليل الذكاء الاصطناعي
              </h3>
              <p className="text-slate-700 leading-relaxed text-justify">
                {aiData.ai_interpretation}
              </p>
              
              <h4 className="font-bold text-slate-800 mt-6 mb-2">أبرز مبررات الترشيح:</h4>
              <ul className="list-disc list-inside text-slate-700 space-y-1">
                {aiData.reasons_for_nomination.map((reason, i) => <li key={i}>{reason}</li>)}
              </ul>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center border border-slate-100 min-h-[300px]">
              <h4 className="font-bold text-slate-700 mb-2 text-center">خريطة القدرات (متوسط المحاور)</h4>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontFamily: 'system-ui' }} />
                  <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: '#94a3b8' }} />
                  <Radar name="تقييم الطالب" dataKey="التقييم" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.4} />
                  <RechartsTooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Strengths & Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-emerald-50 p-5 rounded-xl border border-emerald-100">
              <h4 className="font-bold text-emerald-800 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> نقاط القوة البارزة
              </h4>
              <ul className="list-disc list-inside text-emerald-700 space-y-2 text-sm">
                {aiData.strengths.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
            <div className="bg-amber-50 p-5 rounded-xl border border-amber-100">
              <h4 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> جوانب تحتاج لتنمية
              </h4>
              <ul className="list-disc list-inside text-amber-700 space-y-2 text-sm">
                {aiData.areas_for_improvement.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          </div>

          {/* Recommendations */}
          <h3 className="text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">التوصيات التربوية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <h4 className="font-bold text-indigo-700 mb-2">للمعلم داخل الفصل:</h4>
              <ul className="list-disc list-inside text-slate-700 space-y-2 text-sm">
                {aiData.teacher_recommendations.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-indigo-700 mb-2">لولي الأمر بالمنزل:</h4>
              <ul className="list-disc list-inside text-slate-700 space-y-2 text-sm">
                {aiData.parent_recommendations.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          </div>

          {/* Activities & Follow up */}
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
            <h4 className="font-bold text-slate-800 mb-3">أنشطة إثرائية مقترحة:</h4>
            <div className="flex flex-wrap gap-2 mb-6">
              {aiData.suggested_activities.map((item, i) => (
                <span key={i} className="bg-white border border-slate-200 px-3 py-1 rounded-full text-sm text-slate-600 shadow-sm">
                  {item}
                </span>
              ))}
            </div>
            
            <h4 className="font-bold text-slate-800 mb-2">خطة المتابعة (3 أشهر):</h4>
            <p className="text-slate-700 text-sm leading-relaxed">
              {aiData.follow_up_plan}
            </p>
          </div>

          {/* Footer / Signature */}
          <div className="mt-10 pt-6 border-t border-slate-200 flex justify-between items-end text-sm text-slate-600">
            <div>
              <span className="block text-slate-400 mb-1">مديرة المدرسة</span>
              <span className="font-bold text-slate-800">وفاء جابر</span>
            </div>
            <div className="text-left">
              <span className="block text-slate-400 mb-1">التوقيع</span>
              <span className="inline-block w-32 border-b border-slate-300">&nbsp;</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    // Calculate stats
    const total = reports.length;
    const strongNominees = reports.filter(r => r.aiData?.nomination_level?.includes('بقوة')).length;
    const moderateNominees = reports.filter(r => r.aiData?.nomination_level?.includes('متوسطة')).length;
    const observationNominees = total - strongNominees - moderateNominees;

    const pieData = [
      { name: 'مرشح بقوة', value: strongNominees, color: '#10b981' }, // emerald-500
      { name: 'مرشح بدرجة متوسطة', value: moderateNominees, color: '#f59e0b' }, // amber-500
      { name: 'يحتاج ملاحظة', value: observationNominees, color: '#3b82f6' }, // blue-500
    ].filter(d => d.value > 0);

    // Group by Grade
    const gradeCount = {};
    reports.forEach(r => {
      const grade = r.student?.grade || 'غير محدد';
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });
    const barData = Object.keys(gradeCount).map(k => ({ name: k, count: gradeCount[k] }));

    return (
      <div className="space-y-6 fade-in">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">لوحة الإدارة والإحصائيات</h2>
        
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="text-slate-500 text-sm font-medium mb-1">إجمالي التقييمات</div>
            <div className="text-3xl font-bold text-slate-800">{total}</div>
          </div>
          <div className="bg-emerald-50 p-6 rounded-xl shadow-sm border border-emerald-100">
            <div className="text-emerald-700 text-sm font-medium mb-1">مرشح بقوة</div>
            <div className="text-3xl font-bold text-emerald-800">{strongNominees}</div>
          </div>
          <div className="bg-amber-50 p-6 rounded-xl shadow-sm border border-amber-100">
            <div className="text-amber-700 text-sm font-medium mb-1">ترشيح متوسط</div>
            <div className="text-3xl font-bold text-amber-800">{moderateNominees}</div>
          </div>
          <div className="bg-blue-50 p-6 rounded-xl shadow-sm border border-blue-100">
            <div className="text-blue-700 text-sm font-medium mb-1">يحتاج ملاحظة</div>
            <div className="text-3xl font-bold text-blue-800">{observationNominees}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-6">توزيع التقييمات حسب الصف</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#64748b' }} allowDecimals={false} />
                  <RechartsTooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="count" name="عدد الطلاب" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-6">نسب مستويات الترشيح</h3>
            <div className="h-64">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value"
                      label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">لا توجد بيانات كافية</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHistory = () => {
    // قوائم الصفوف والمواد الموجودة فعلياً في السجل (لبناء قوائم التصفية ديناميكياً)
    const uniqueGrades = [...new Set(reports.map(r => r.student?.grade).filter(Boolean))].sort();
    const uniqueSubjects = [...new Set(reports.map(r => r.student?.subject).filter(Boolean))].sort();

    const filteredReports = reports.filter(r => 
      (r.student?.name?.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
       r.student?.studentId?.includes(historySearchTerm)) &&
      (historyGradeFilter === '' || r.student?.grade === historyGradeFilter) &&
      (historySubjectFilter === '' || r.student?.subject === historySubjectFilter)
    );

    if (selectedHistoryReport) {
      return (
        <div className="fade-in">
          <button onClick={() => setSelectedHistoryReport(null)} className="mb-4 text-indigo-600 hover:underline flex items-center gap-1 no-print">
             <ChevronRight className="w-4 h-4" /> العودة للقائمة
          </button>
          {renderReportStep(selectedHistoryReport, true)}
        </div>
      )
    }

    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
          <h2 className="text-xl font-bold text-slate-800">سجل التقييمات السابقة</h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-5 h-5 absolute right-3 top-2.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="ابحث بالاسم أو الرقم..." 
              value={historySearchTerm}
              onChange={(e) => setHistorySearchTerm(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <select
            value={historyGradeFilter}
            onChange={(e) => setHistoryGradeFilter(e.target.value)}
            className="w-full sm:w-48 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700"
          >
            <option value="">كل الصفوف</option>
            {uniqueGrades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select
            value={historySubjectFilter}
            onChange={(e) => setHistorySubjectFilter(e.target.value)}
            className="w-full sm:w-48 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700"
          >
            <option value="">كل المواد</option>
            {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {(historyGradeFilter || historySubjectFilter || historySearchTerm) && (
            <button
              onClick={() => { setHistoryGradeFilter(''); setHistorySubjectFilter(''); setHistorySearchTerm(''); }}
              className="text-sm text-slate-500 hover:text-red-600 underline whitespace-nowrap self-center"
            >
              مسح التصفية
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">اسم الطالب</th>
                <th className="p-3">الصف</th>
                <th className="p-3">المادة</th>
                <th className="p-3">حالة الترشيح</th>
                <th className="p-3">النسبة</th>
                <th className="p-3">تاريخ التقييم</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.length > 0 ? filteredReports.map((report) => {
                const isStrong = report.aiData?.nomination_level?.includes('بقوة');
                const isModerate = report.aiData?.nomination_level?.includes('متوسطة');
                const statusText = isStrong ? 'مرشح بقوة' : isModerate ? 'مرشح مبدئياً' : 'غير مرشح (يحتاج ملاحظة)';
                const statusClass = isStrong ? 'bg-emerald-100 text-emerald-700' : isModerate ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700';

                return (
                <tr key={report.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-3">
                    <div className="font-bold text-slate-800 text-base">{report.student?.name}</div>
                    <div className="text-xs text-slate-500">الرقم: {report.student?.studentId}</div>
                  </td>
                  <td className="p-3 text-slate-700">{report.student?.grade} {report.student?.section}</td>
                  <td className="p-3 text-slate-700">{report.student?.subject || '-'}</td>
                  <td className="p-3">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${statusClass}`}>
                      {statusText}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-indigo-600">{report.aiData?.overallPercentage}%</td>
                  <td className="p-3 text-slate-500">
                    {report.date ? new Date(report.date).toLocaleDateString('ar-EG') : '-'}
                  </td>
                  <td className="p-3 flex items-center gap-3">
                    <button 
                      onClick={() => setSelectedHistoryReport(report)}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm font-medium"
                    >
                      عرض التقرير
                    </button>
                    <button 
                      onClick={() => handleDeleteReport(report.id)}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                      title="مسح التقرير نهائياً"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )}) : (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-500">
                    لا توجد تقييمات مطابقة لمعايير البحث/التصفية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900 font-sans" style={{ fontFamily: "'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      {/* Dynamic CSS for Animations and Print */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .printable-report { margin: 0; padding: 0; box-shadow: none; border: none; }
          .report-page { break-inside: avoid; border: none !important; padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-2 rounded-lg">
                <BrainCircuit className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-800">نظام ترشيح الموهوبين</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-4 overflow-x-auto">
              <button 
                onClick={() => { setActiveTab('new'); if(currentStep===4) resetForm(); }}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap
                  ${activeTab === 'new' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">تقييم جديد</span>
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap
                  ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <FileText className="w-4 h-4" /> <span className="hidden sm:inline">سجل التقييمات</span>
              </button>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap
                  ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" /> <span className="hidden sm:inline">لوحة الإدارة</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loadError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3 no-print">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">تعذر تحميل سجل التقييمات المحفوظ سابقاً. جرّب تحديث الصفحة، وإن استمرت المشكلة تواصل مع الإدارة.</span>
          </div>
        )}
        {activeTab === 'new' && (
          <div className="max-w-4xl mx-auto">
            {/* Progress Bar */}
            {currentStep < 4 && (
              <div className="mb-8 no-print">
                <div className="flex items-center justify-between text-sm font-medium text-slate-500 mb-2">
                  <span className={currentStep >= 1 ? 'text-indigo-600' : ''}>1. بيانات الطالب</span>
                  <span className={currentStep >= 2 ? 'text-indigo-600' : ''}>2. مقياس التقييم</span>
                  <span className={currentStep >= 3 ? 'text-indigo-600' : ''}>3. تحليل النتائج</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden flex">
                  <div className={`h-full bg-indigo-600 transition-all duration-500 ease-in-out ${currentStep === 1 ? 'w-1/3' : currentStep === 2 ? 'w-2/3' : 'w-full'}`}></div>
                </div>
              </div>
            )}

            {/* Step Rendering */}
            {currentStep === 1 && renderInfoStep()}
            {currentStep === 2 && renderAssessmentStep()}
            {currentStep === 3 && renderLoadingStep()}
            {currentStep === 4 && renderReportStep()}
          </div>
        )}

        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'history' && renderHistory()}
      </main>

      {/* Custom Modal for Alerts and Confirms */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4 no-print fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
            {modal.type === 'error' ? (
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            ) : (
              <Trash2 className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            )}
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              {modal.type === 'error' ? 'تنبيه' : 'تأكيد الإجراء'}
            </h3>
            <p className="text-slate-600 mb-6">{modal.message}</p>
            <div className="flex gap-3 justify-center">
              {modal.type === 'confirm' && (
                <button 
                  onClick={modal.onConfirm}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  نعم، تأكيد الحذف
                </button>
              )}
              <button 
                onClick={() => setModal({ isOpen: false })}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
              >
                {modal.type === 'error' ? 'إغلاق' : 'إلغاء'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
