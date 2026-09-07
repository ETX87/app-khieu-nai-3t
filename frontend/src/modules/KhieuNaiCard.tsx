import type { KhieuNai } from "../api/types";
import { StatusBadge } from "../components/ui/Badge";

// Chuoi ngay gio luu boi backend la "VN-local nhung khong co timezone" (xem nowVN()).
// Parse nhu UTC roi so sanh voi "now" cung quy uoc +7h de phan chenh lech trieu tieu, ra dung so gio thuc te.
function parseVnNaive(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

function gioXuLy(kn: KhieuNai): number {
  const start = parseVnNaive(kn.ngay_tiep_nhan);
  const end = kn.trang_thai === "Da ket thuc" && kn.ngay_ket_thuc ? parseVnNaive(kn.ngay_ket_thuc) : Date.now() + 7 * 3600 * 1000;
  return Math.max(0, (end - start) / 3_600_000);
}

function formatGioXuLy(kn: KhieuNai): string {
  const h = gioXuLy(kn);
  if (h < 1) return "<1 giờ";
  if (h < 48) return `${Math.round(h)} giờ`;
  return `${Math.round(h / 24)} ngày`;
}

export function KhieuNaiCard({ kn, onClick }: { kn: KhieuNai; onClick: () => void }) {
  const maCrmHoacLada = kn.id_lada ?? kn.id_crm_karofi ?? "—";
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-1 rounded-lg border border-line bg-white px-3 py-2.5 text-left active:bg-gray-50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{kn.ten_khach ?? "—"}</span>
        <StatusBadge trangThai={kn.trang_thai} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-soft">
        <span className="font-mono">{kn.id}</span>
        <span>·</span>
        <span className="truncate">{maCrmHoacLada}</span>
        <span>·</span>
        <span>{kn.ngay_tiep_nhan.slice(0, 10)}</span>
        <span>·</span>
        <span>{formatGioXuLy(kn)}</span>
      </div>
    </button>
  );
}
