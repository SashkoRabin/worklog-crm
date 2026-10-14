"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Globe2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Lang } from "@/lib/worklog";

const words = {
  en: {
    login: "Sign in",
    create: "Create account",
    password: "Password",
    email: "Email",
    intro: "Use your email and password to access your private workspace.",
    wait: "Please wait…",
    missing: "Supabase is not configured.",
  },
  ru: {
    login: "Войти",
    create: "Создать аккаунт",
    password: "Пароль",
    email: "Эл. почта",
    intro:
      "Войдите по электронной почте, чтобы открыть личное рабочее пространство.",
    wait: "Подождите…",
    missing: "Supabase не настроен.",
  },
  cs: {
    login: "Přihlásit se",
    create: "Vytvořit účet",
    password: "Heslo",
    email: "E-mail",
    intro:
      "Přihlaste se e-mailem a heslem do svého soukromého pracovního prostoru.",
    wait: "Čekejte…",
    missing: "Supabase není nastaven.",
  },
};
export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login"),
    [lang, setLang] = useState<Lang>("en"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter(),
    t = words[lang];
  useEffect(() => {
    const saved = localStorage.getItem("worklog-lang") as Lang | null;
    if (saved) setLang(saved);
  }, []);
  function changeLang(value: Lang) {
    setLang(value);
    localStorage.setItem("worklog-lang", value);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const values = new FormData(event.currentTarget),
      email = String(values.get("email")),
      password = String(values.get("password"));
    if (!supabase) {
      setError(t.missing);
      setPending(false);
      return;
    }
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (result.error) setError(result.error.message);
    else router.replace("/");
    setPending(false);
  }
  return (
    <main className="auth">
      <section>
        <div className="brand">
          <Image className="brand-logo" src="/yk-logo.png" alt="YK" width={36} height={36} priority />
          <span className="brand-name">YK WorkLog</span>
        </div>
        <label className="auth-language language">
          <Globe2 size={15} />
          <select
            value={lang}
            onChange={(e) => changeLang(e.target.value as Lang)}
          >
            <option value="en">English</option>
            <option value="ru">Русский</option>
            <option value="cs">Čeština</option>
          </select>
        </label>
        <p className="eyebrow">WORKLOG</p>
        <h1>
          Work in the rhythm
          <br />
          <em>of your life.</em>
        </h1>
        <p className="auth-copy">{t.intro}</p>
        <div className="auth-card">
          <div className="tabs">
            <button
              className={mode === "login" ? "chosen" : ""}
              onClick={() => setMode("login")}
            >
              {t.login}
            </button>
            <button
              className={mode === "signup" ? "chosen" : ""}
              onClick={() => setMode("signup")}
            >
              {t.create}
            </button>
          </div>
          <form onSubmit={submit}>
            <label>
              {t.email}
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              {t.password}
              <input
                name="password"
                type="password"
                minLength={6}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full" disabled={pending}>
              {pending ? t.wait : mode === "login" ? t.login : t.create}
            </button>
          </form>
        </div>
      </section>
      <div className="auth-art" />
    </main>
  );
}
