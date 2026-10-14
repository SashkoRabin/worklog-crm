"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

/** Makes the existing site behave as a full-height Telegram Mini App. */
export function TelegramWebApp() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
  }, []);

  return <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />;
}
