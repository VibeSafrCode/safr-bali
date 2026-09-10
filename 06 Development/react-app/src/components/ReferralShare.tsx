import { useEffect, useRef, useState } from "react";
import { safeReferralLink } from "./referral-link";
import "./account-details.css";

const text = {
  ru: { link: "Персональная ссылка", unavailable: "Ссылка пока недоступна", copy: "Скопировать ссылку", copied: "Ссылка скопирована", failure: "Не удалось скопировать. Выделите ссылку и скопируйте вручную.", qr: "QR-код приглашения", scan: "Покажите QR-код другу или отправьте ссылку.", qrError: "QR-код недоступен. Вы можете отправить ссылку.", loading: "Готовим QR-код…" },
  en: { link: "Personal link", unavailable: "Link is not available yet", copy: "Copy link", copied: "Link copied", failure: "Could not copy. Select the link and copy it manually.", qr: "Invitation QR code", scan: "Show this QR code to a friend or send your link.", qrError: "QR code is unavailable. You can send the link instead.", loading: "Preparing QR code…" },
};

export function ReferralShare({ link, locale, onCopied }: { link?: string | null; locale: "ru" | "en"; onCopied?: () => void }) {
  const copy = text[locale];
  const safeLink = safeReferralLink(link);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failure">("idle");
  const [qr, setQr] = useState<"loading" | "ready" | "error">("loading");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    let active = true;
    setFeedback("idle");
    setQr("loading");
    if (safeLink && canvas.current) {
      const target = canvas.current;
      void import("qrcode").then(({ default: QRCode }) => {
        if (!active) return;
        return QRCode.toCanvas(target, safeLink, { errorCorrectionLevel: "M", margin: 4, width: 256, color: { dark: "#000000", light: "#ffffff" } });
      }).then(() => { if (active) setQr("ready"); }).catch(() => { if (active) setQr("error"); });
    }
    return () => { active = false; };
  }, [safeLink]);
  async function copyLink() {
    if (!safeLink || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(safeLink);
      setFeedback("copied");
      onCopied?.();
    } catch { setFeedback("failure"); }
    finally { setCopying(false); }
  }
  return <section className="account-detail-card referral-share" aria-label={copy.link}>
    {!safeLink ? <p>{copy.unavailable}</p> : <>
      <label>{copy.link}<input readOnly value={safeLink} onFocus={(event) => event.currentTarget.select()} /></label>
      <button className="button secondary" type="button" onClick={() => void copyLink()} disabled={copying}>{copy.copy}</button>
      <div role="status" aria-live="polite">{feedback === "copied" ? copy.copied : feedback === "failure" ? copy.failure : ""}</div>
      <figure>
        <canvas ref={canvas} role="img" aria-label={copy.qr} hidden={qr !== "ready"} />
        <figcaption>{qr === "error" ? copy.qrError : qr === "loading" ? copy.loading : copy.scan}</figcaption>
      </figure>
    </>}
  </section>;
}
