import type { UiLanguage } from "@/lib/locale-store";

export type ApiErrorsCopy = {
  llm: string;
  network: string;
  backend: string;
  auth: string;
  rateLimit: string;
  citation: string;
  streamInterrupted: string;
  validationNameRequired: string;
};

const EN: ApiErrorsCopy = {
  llm: "AI connection hit a snag. Try switching Model/Provider.",
  network: "Could not reach the server. Check your connection and try again.",
  backend: "The server ran into a problem. Please try again later.",
  auth: "Your session has expired. Please sign in again.",
  rateLimit: "Too many requests. Please try again later.",
  citation: "Could not verify citations right now. Please try again later.",
  streamInterrupted: "Stream interrupted. Please try again.",
  validationNameRequired: "Full name is required.",
};

const VI: ApiErrorsCopy = {
  llm: "Úi, kết nối tới AI đang bị gián đoạn một chút. Bạn thử đổi Model/Provider giúp mình nhé!",
  network: "Không kết nối được server. Kiểm tra kết nối và thử lại.",
  backend: "Server đang gặp sự cố. Vui lòng thử lại sau.",
  auth: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  rateLimit: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
  citation: "Không thể xác minh trích dẫn lúc này. Vui lòng thử lại sau.",
  streamInterrupted: "Kết nối stream bị gián đoạn. Vui lòng thử lại.",
  validationNameRequired: "Vui lòng nhập họ tên.",
};

export function apiErrorsCopy(locale: UiLanguage): ApiErrorsCopy {
  return locale === "vi" ? VI : EN;
}
