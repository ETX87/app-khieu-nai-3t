// Anh/video dinh kem (Google Drive) - hang so + helper dung chung giua form tao phan anh
// (KhieuNaiForm.tsx, dinh kem "cho" roi upload sau khi co ID) va man chi tiet (KhieuNaiDetail.tsx,
// dinh kem truc tiep vao don co san).

export const DINH_KEM_MAX_ANH = 5;
export const DINH_KEM_MAX_VIDEO = 3;
export const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const VIDEO_MAX_DURATION_S = 60;
export const IMAGE_MAX_DIMENSION = 1600;
export const IMAGE_JPEG_QUALITY = 0.75;

export const DINH_KEM_ERROR_MESSAGES: Record<string, string> = {
  DRIVE_NOT_CONNECTED: "Chưa kết nối Google Drive (Admin cần vào Cài đặt để kết nối)",
  FILE_TOO_LARGE: "File vượt quá dung lượng cho phép",
  LIMIT_REACHED: "Đã đạt số lượng tối đa",
  DRIVE_UPLOAD_FAILED: "Tải lên Google Drive thất bại",
  INVALID_INPUT: "File không hợp lệ",
};

export function driveViewUrl(driveFileId: string) {
  return `https://drive.google.com/file/d/${driveFileId}/view`;
}

// Nen anh truoc khi day len Drive: resize canh dai nhat ve toi da IMAGE_MAX_DIMENSION, xuat JPEG
// chat luong ~0.75. Neu trinh duyet khong ho tro (loi bat ky) thi tra ve file goc, server van
// chan theo dung luong (DINH_KEM_MAX_BYTES.anh ben backend).
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Khong nen that video (theo lua chon cua nguoi dung) - chi doc thoi luong de chan truoc khi upload,
// tranh ton bang thong + luot doc D1/Drive API cho video qua dai.
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("VIDEO_READ_FAILED"));
    };
    video.src = url;
  });
}
