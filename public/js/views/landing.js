import { el, clear } from '../helpers.js';
import { loginCard } from './login.js';

const FEATURES = [
  { icon: '🏠', title: 'لوحة التحكم', desc: 'صورة سريعة عن حالة النظام: عدادات البطولات والمنتخبات واللاعبين والمباريات والأهداف، وأحدث المباريات.' },
  { icon: '🏆', title: 'البطولات', desc: 'سجل بطولة قابل للتشغيل: إنشاء وتعديل وحذف وتصفية حسب الفئة وعرض التفاصيل الكاملة.' },
  { icon: '🛡️', title: 'المنتخبات', desc: 'مرجع الفرق المشاركة: إضافة المنتخب والدولة والرمز والمدرب والفئة والعلم.' },
  { icon: '👥', title: 'اللاعبون', desc: 'قائمة لاعبين قابلة للبحث: إضافة اللاعب ورقمه ومركزه ومنتخبه وفئته، مع البحث والتصفية.' },
  { icon: '📅', title: 'المباريات', desc: 'جدول ونتائج موحدان: إنشاء وتعديل وحذف وتصفية المباريات حسب البطولة والمنتخب والحالة.' },
  { icon: '📊', title: 'الإحصائيات', desc: 'رؤية تحليلية: جدول الترتيب والهدافون ودقائق اللعب، بتقارير قابلة للتصفية حسب البطولة.' },
];

const FLOW_STEPS = [
  { n: '1', title: 'إنشاء البطولة', desc: 'بيانات أساسية صحيحة: الفئة والدولة المضيفة والفترة الزمنية.' },
  { n: '2', title: 'تجهيز المجموعات', desc: 'توزيع المنتخبات على مجموعتين ثم اعتمادهما رسميًا.' },
  { n: '3', title: 'توليد دور المجموعات', desc: 'مباريات دوري من دور واحد لكل مجموعة، تُنشأ مرة واحدة فقط بلا تكرار.' },
  { n: '4', title: 'نصف النهائي ثم النهائي', desc: 'تأهل أول فريقين من كل مجموعة، وصولًا للنهائي ومباراة المركز الثالث.' },
];

const ROLES = [
  { title: 'مدير النظام', desc: 'إدارة المستخدمين والصلاحيات وسجل التدقيق' },
  { title: 'مدير بطولة', desc: 'إنشاء البطولة واعتماد المجموعات وتوليد المراحل' },
  { title: 'مدخل بيانات', desc: 'إدخال المباريات والنتائج وأحداثها واللاعبين' },
  { title: 'مراجع نتائج', desc: 'مراجعة البيانات واعتماد النتائج أو إعادتها للتصحيح' },
  { title: 'مشاهد أو محلل', desc: 'قراءة اللوحات والتقارير من دون تعديل' },
];

export function renderLanding(onSuccess) {
  const app = document.getElementById('app');
  clear(app);

  const scrollToLogin = (e) => {
    if (e) e.preventDefault();
    document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const nav = el('header', { class: 'landing-nav' }, [
    el('div', { class: 'landing-nav-brand' }, [
      el('span', { class: 'landing-nav-title' }, 'إحصائيات كأس الخليج'),
      el('span', { class: 'landing-nav-sub' }, 'بوابة الإدارة الشاملة'),
    ]),
    el('button', { class: 'btn btn-gold', onclick: scrollToLogin }, 'تسجيل الدخول'),
  ]);

  const hero = el('section', { class: 'landing-hero' }, [
    el('span', { class: 'landing-eyebrow' }, 'بوابة إدارة البطولات الرياضية'),
    el('h1', {}, 'نظام إدارة وإحصائيات بطولات كأس الخليج العربي'),
    el('p', { class: 'landing-hero-sub' },
      'مصدر واحد موثوق لإدارة بيانات البطولة ومراحلها ونتائجها وإحصائياتها، من إنشاء البطولة وحتى رفع كأس النهائي — مع تقليل العمل اليدوي والأخطاء عند الانتقال بين المراحل.'),
    el('div', { class: 'landing-hero-actions' }, [
      el('button', { class: 'btn btn-primary', onclick: scrollToLogin }, 'الدخول إلى النظام →'),
    ]),
  ]);

  const featuresSection = el('section', { class: 'landing-section' }, [
    el('h2', {}, 'كل ما تحتاجه لإدارة البطولة في مكان واحد'),
    el('div', { class: 'feature-grid' }, FEATURES.map((f) => el('div', { class: 'feature-card' }, [
      el('div', { class: 'feature-icon' }, f.icon),
      el('h3', {}, f.title),
      el('p', {}, f.desc),
    ]))),
  ]);

  const flowSection = el('section', { class: 'landing-section landing-section-alt' }, [
    el('h2', {}, 'كيف يعمل النظام'),
    el('p', { class: 'landing-section-sub' }, 'يمر تشغيل البطولة بأربع مراحل مترابطة، ولا يسمح النظام بالقفز إلى مرحلة لاحقة قبل اكتمال شروط المرحلة السابقة.'),
    el('div', { class: 'flow-steps' }, FLOW_STEPS.map((s) => el('div', { class: 'flow-step' }, [
      el('div', { class: 'flow-step-num' }, s.n),
      el('div', {}, [el('h4', {}, s.title), el('p', {}, s.desc)]),
    ]))),
    el('div', { class: 'callout' }, [
      el('strong', {}, 'الحكم الجوهري: '),
      'توليد كل مرحلة يبقى خاضعًا لشروط واضحة يتحقق منها الخادم، لا لمجرد تفعيل الأزرار في الواجهة — ما يمنع تكرار المباريات أو تأهل فرق قبل اكتمال النتائج.',
    ]),
  ]);

  const rolesSection = el('section', { class: 'landing-section' }, [
    el('h2', {}, 'صلاحيات مصممة لكل دور'),
    el('div', { class: 'roles-grid' }, ROLES.map((r) => el('div', { class: 'role-chip' }, [
      el('strong', {}, r.title),
      el('span', {}, r.desc),
    ]))),
  ]);

  const loginSection = el('section', { class: 'landing-section landing-login-section' }, [
    loginCard(onSuccess),
  ]);

  const footer = el('footer', { class: 'landing-footer' }, [
    el('span', {}, 'إحصائيات كأس الخليج — الإصدار 1.0'),
  ]);

  app.appendChild(el('div', { class: 'landing-page' }, [nav, hero, featuresSection, flowSection, rolesSection, loginSection, footer]));
}
