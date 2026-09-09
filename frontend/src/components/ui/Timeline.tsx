import { Badge } from "./Badge";

export type TimelineTone = "blue" | "violet" | "teal" | "amber" | "green" | "red" | "gray";

export interface TimelineEvent {
  key: string;
  tone: TimelineTone;
  badge: string;
  time: string; // chuỗi hiển thị đã format sẵn
  sortMs: number; // để tính khoảng cách với mốc kế tiếp — truyền events theo thứ tự mới nhất trước
  actor?: string | null;
  summary: string;
}

const DOT_CLASSES: Record<TimelineTone, string> = {
  blue: "bg-blue-500", violet: "bg-violet-500", teal: "bg-teal-500",
  amber: "bg-amber-500", green: "bg-green-500", red: "bg-red-500", gray: "bg-gray-400",
};
const BORDER_CLASSES: Record<TimelineTone, string> = {
  blue: "border-blue-200", violet: "border-violet-200", teal: "border-teal-200",
  amber: "border-amber-200", green: "border-green-200", red: "border-red-200", gray: "border-gray-200",
};

// Học theo giao diện timeline "GT tồn" bên hệ dvbh (CaseDetail.tsx): mỗi mốc = chấm màu + badge
// loại + thời gian/người thao tác + nội dung, kèm dòng "cách mốc trước X ngày" so với mốc kế tiếp
// (giúp thấy ngay khoảng trống xử lý giữa 2 lần chăm sóc).
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <p className="text-xs text-ink-faint">—</p>;
  return (
    <div>
      {events.map((e, i) => {
        const next = events[i + 1];
        const gapDays = next ? (e.sortMs - next.sortMs) / 86_400_000 : null;
        return (
          <div key={e.key} className="pb-3 last:pb-0">
            <div className={`relative border-l-2 pl-4 ${BORDER_CLASSES[e.tone]}`}>
              <div className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${DOT_CLASSES[e.tone]}`} />
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={e.tone}>{e.badge}</Badge>
                <span className="text-xs text-ink-soft">
                  {e.time}
                  {e.actor ? ` · ${e.actor}` : ""}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-sm text-ink">{e.summary}</div>
            </div>
            {gapDays !== null && gapDays > 0.05 && (
              <div className="pl-4 pt-1.5 text-[11px] text-ink-faint">
                ↳ cách mốc trước <strong className="text-ink-soft">{gapDays.toFixed(1)} ngày</strong>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
