"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, MessageCircle, Mic, Send, Volume2, VolumeX, X } from "lucide-react";
import { LANGUAGES } from "@/lib/i18n/dictionary";
import { useT } from "@/lib/i18n/LanguageContext";

export default function ChatWidget() {
  const { t, lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(null);
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState({ recognition: false, synthesis: false });
  const endRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    setVoice({ recognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), synthesis: "speechSynthesis" in window });
    setMuted(window.localStorage.getItem("medha_oa_assistant_muted") === "1");
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function sendMessage(event) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setUnavailable(null);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, lang }) });
      if (!response.ok || !response.body) {
        // The route explains what actually went wrong; a crashed model runner
        // must not be reported to the user as "Ollama is not running".
        const detail = await response.json().catch(() => null);
        setUnavailable(detail?.message || `Request failed (HTTP ${response.status}).`);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let answer = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const chunk = JSON.parse(line); answer += chunk.message?.content || ""; } catch { /* wait for the next complete NDJSON line */ }
          setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message));
        }
      }
      if (buffered.trim()) {
        try { answer += JSON.parse(buffered).message?.content || ""; } catch { /* ignore an incomplete final frame */ }
        setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: answer } : message));
      }
      speak(answer);
    } catch (error) {
      setUnavailable(
        error?.name === "AbortError"
          ? "The connection dropped before the answer finished. Please try again."
          : "Could not reach the assistant. Please try again.",
      );
    }
    finally { setBusy(false); }
  }

  function startVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition || !["en", "hi"].includes(lang)) return;
    const recognition = new Recognition();
    recognition.lang = lang === "hi" ? "hi-IN" : "en-IN";
    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
    recognitionRef.current = recognition;
    recognition.start();
  }

  function speak(content) {
    if (muted || !voice.synthesis || !["en", "hi"].includes(lang) || !content) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    window.speechSynthesis.speak(utterance);
  }

  function toggleMute() {
    setMuted((current) => {
      const next = !current;
      window.localStorage.setItem("medha_oa_assistant_muted", next ? "1" : "0");
      if (next && voice.synthesis) window.speechSynthesis.cancel();
      return next;
    });
  }

  return (
    <div className="fixed bottom-5 right-5 z-50" data-chat-widget>
      {open && (
        <section className="glass shadow-elevation-4 mb-3 flex h-[min(560px,calc(100vh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-white/60 bg-white/30 px-4 py-3">
            <div className="flex items-center gap-2"><div className="rounded-xl bg-assistant-100 p-2 text-assistant-700"><Bot size={18} /></div><div><div className="text-sm font-semibold text-slate-800">{t("assistant.name")}</div><div className="text-caption text-slate-500">{t("assistant.subtitle")}</div></div></div>
            <div className="flex items-center gap-1"><select value={lang} onChange={(event) => setLang(event.target.value)} className="rounded-lg border-0 bg-white/60 px-2 py-1 text-xs text-slate-700">{LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.native}</option>)}</select>{voice.synthesis && <button className="btn-ghost !p-2" onClick={toggleMute} aria-label={muted ? t("assistant.unmute") : t("assistant.mute")} title={muted ? t("assistant.unmute") : t("assistant.mute")}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>}<button className="btn-ghost !p-2" onClick={() => setOpen(false)} aria-label={t("assistant.close")}><X size={18} /></button></div>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && <div className="rounded-xl border border-white/60 bg-white/35 p-4 text-sm text-slate-600">{t("assistant.greeting")}</div>}
            {unavailable && <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">{unavailable} <span className="mt-1 block text-xs">{t("assistant.setup")}</span></div>}
            {messages.map((message, index) => <div key={`${message.role}-${index}`} className={`group flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "bg-clinical-600 text-white" : "glass text-slate-700"}`}>{message.content}{message.role === "assistant" && message.content && voice.synthesis && ["en", "hi"].includes(lang) && <button className="ml-2 inline-flex text-assistant-700" onClick={() => speak(message.content)} aria-label={t("assistant.speak")}><Volume2 size={14} /></button>}</div></div>)}
            {busy && <div className="text-xs text-slate-500">{t("assistant.thinking")}</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-white/60 bg-white/25 p-3"><input value={input} onChange={(event) => setInput(event.target.value)} className="input !bg-white/70 !py-2" placeholder={t("assistant.placeholder")} /><button type="button" onClick={startVoice} disabled={!voice.recognition || !["en", "hi"].includes(lang)} className="btn-ghost !p-2" title={t("assistant.voiceHint")} aria-label={t("assistant.voiceHint")}><Mic size={18} /></button><button className="btn-primary !p-2" aria-label={t("assistant.send")}><Send size={18} /></button></form>
          <footer className="px-3 pb-2 text-center text-caption text-slate-500">{t("assistant.offline")}</footer>
        </section>
      )}
      <button onClick={() => setOpen((value) => !value)} className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-assistant-600 to-clinical-600 text-white shadow-elevation-4 transition-transform hover:scale-105 active:scale-95" aria-label={t("assistant.open")}><MessageCircle size={24} /></button>
    </div>
  );
}