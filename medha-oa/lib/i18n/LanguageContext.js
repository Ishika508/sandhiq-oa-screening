"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DICTIONARIES, translate } from "./dictionary";

const LangContext = createContext({ lang: "en", setLang: () => {}, t: (k) => k, fallbackWarning: false });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("en");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("medha_oa_lang") : null;
    if (saved && DICTIONARIES[saved]) setLangState(saved);
  }, []);

  const setLang = useCallback((code) => {
    setLangState(code);
    if (typeof window !== "undefined") localStorage.setItem("medha_oa_lang", code);
  }, []);

  const dict = DICTIONARIES[lang] || DICTIONARIES.en;
  const t = useCallback((path, vars) => translate(dict, path, vars), [dict]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, questionnaireFallback: dict.questionnaireFallback }}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  return useContext(LangContext);
}
