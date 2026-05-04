import { ref } from 'vue'
import { translations } from '../i18n/index.js'

const lang = ref(localStorage.getItem('kachaka_lang') || 'en')

export function useI18n() {
  function t(key, params = {}) {
    let str = translations[lang.value]?.[key] ?? translations['en']?.[key] ?? key
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(`{${k}}`, v)
    }
    return str
  }

  function setLang(newLang) {
    if (!translations[newLang]) return
    lang.value = newLang
    localStorage.setItem('kachaka_lang', newLang)
  }

  return { lang, t, setLang }
}
