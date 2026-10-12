// Sample data matching the prototype, used until the hub is running.
import type { Meeting, SpeakerState } from "../types";

const at = (hms: string) => `2025-04-28T${hms}`;

export const mockMeeting: Meeting = {
  id: "demo",
  title: "الاجتماع التنفيذي الأسبوعي",
  agenda: ["نتائج الربع الأول", "كفاءة العمليات", "تجربة العملاء الرقمية", "خطة التنفيذ"],
  language: "ar",
  floor_mode: "one_at_a_time",
  status: "live",
  started_at: at("10:00:00"),
  ended_at: at("11:15:00"),
  participants: [
    { id: "p1", name: "خالد", title: "المدير التنفيذي", device_id: "btn-1", color: "#3b82f6", is_chair: true },
    { id: "p2", name: "سعيد", title: "مدير العمليات", device_id: "btn-2", color: "#22c55e" },
    { id: "p3", name: "ماجد", title: "مدير التقنية", device_id: "btn-3", color: "#a855f7" },
    { id: "p4", name: "فاطمة", title: "مديرة المشاريع", device_id: "btn-4", color: "#ec4899" },
    { id: "p5", name: "مريم", title: "المديرة المالية", device_id: "btn-5", color: "#f59e0b" },
    { id: "p6", name: "أحمد", title: "مدير خدمة العملاء", device_id: "btn-6", color: "#06b6d4" },
  ],
  utterances: [
    { id: "u1", participant_id: "p1", started_at: at("10:00:12"), ended_at: at("10:01:30"), text: "نبدأ الاجتماع بمناقشة نتائج الربع الأول من العام الحالي." },
    { id: "u2", participant_id: "p5", started_at: at("10:01:45"), ended_at: at("10:03:10"), text: "إجمالي المبيعات بلغ 2.4 مليون ريال، بزيادة 12% عن الربع السابق." },
    { id: "u3", participant_id: "p2", started_at: at("10:03:25"), ended_at: at("10:05:00"), text: "أقترح التركيز على تحسين كفاءة العمليات في الفروع الداخلية." },
    { id: "u4", participant_id: "p3", started_at: at("10:07:10"), ended_at: at("10:09:00"), text: "من المهم أيضاً تعزيز تجربة العملاء في القنوات الرقمية." },
    { id: "u5", participant_id: "p6", started_at: at("10:09:20"), ended_at: at("10:10:00"), text: "مستوى رضا العملاء وصل إلى 4.7 من 5، والطلب على الخدمات الإلكترونية في ازدياد." },
    { id: "u6", participant_id: "p4", started_at: at("10:10:05"), ended_at: at("10:11:40"), text: "أوافق. ونحتاج إلى خطة تنفيذ واضحة مع تحديد الموارد والجدول الزمني." },
    { id: "u7", participant_id: "p1", started_at: at("10:12:00"), ended_at: at("10:12:50"), text: "ممتاز. نشكّل فريق عمل لإعداد الخطة ونراجعها في الاجتماع القادم." },
  ],
  report: {
    language: "ar",
    approved: false,
    summary: [
      "تم استعراض نتائج الربع الأول وأداء الفروع.",
      "تم الاتفاق على التركيز على تحسين كفاءة العمليات.",
      "التأكيد على تطوير تجربة العملاء في القنوات الرقمية.",
      "تحديد فريق عمل لإعداد خطة التنفيذ.",
    ],
    decisions: [
      { id: "d1", text: "اعتماد خطة تحسين كفاءة العمليات." },
      { id: "d2", text: "تطوير تجربة العملاء في القنوات الرقمية." },
      { id: "d3", text: "تشكيل فريق عمل لإعداد خطة التنفيذ." },
    ],
    tasks: [
      { id: "t1", text: "إعداد خطة تحسين العمليات", owner_id: "p2", due_date: "2025-05-10", done: false },
      { id: "t2", text: "دراسة الحلول التقنية", owner_id: "p3", due_date: "2025-05-15", done: false },
      { id: "t3", text: "مراجعة الميزانية", owner_id: "p5", due_date: "2025-05-20", done: true },
    ],
  },
};

export const mockSpeakerStates: Record<string, SpeakerState> = {
  "btn-1": "talking",
  "btn-2": "muted",
  "btn-3": "muted",
  "btn-4": "waiting",
  "btn-5": "muted",
  "btn-6": "muted",
};

export interface MeetingSummary {
  id: string;
  title: string;
  started_at: string;
  ended_at: string;
  participants: number;
  approved: boolean;
}

export const mockHistory: MeetingSummary[] = [
  { id: "demo", title: "الاجتماع التنفيذي الأسبوعي", started_at: "2025-04-28T10:00:00", ended_at: "2025-04-28T11:15:00", participants: 6, approved: false },
  { id: "h2", title: "مراجعة ميزانية الربع الثاني", started_at: "2025-04-24T09:30:00", ended_at: "2025-04-24T10:20:00", participants: 4, approved: true },
  { id: "h3", title: "لجنة التحول الرقمي", started_at: "2025-04-21T12:00:00", ended_at: "2025-04-21T13:40:00", participants: 9, approved: true },
  { id: "h4", title: "Vendor review — CRM platform", started_at: "2025-04-17T14:00:00", ended_at: "2025-04-17T14:45:00", participants: 5, approved: true },
  { id: "h5", title: "الاجتماع التنفيذي الأسبوعي", started_at: "2025-04-14T10:00:00", ended_at: "2025-04-14T11:05:00", participants: 6, approved: true },
  { id: "h6", title: "تخطيط فعالية العملاء السنوية", started_at: "2025-04-10T11:00:00", ended_at: "2025-04-10T11:50:00", participants: 7, approved: true },
];
