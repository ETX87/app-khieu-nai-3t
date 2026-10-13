import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import vi from "./locales/vi.json";
import en from "./locales/en.json";
import id from "./locales/id.json";

// 3 ngon ngu nho, dong goi tinh san trong bundle - khong can backend/lazy-load plugin cua i18next.
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en }, id: { translation: id } },
  lng: "vi",
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
});

export default i18n;
