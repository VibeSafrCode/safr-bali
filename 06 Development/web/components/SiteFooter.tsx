import { ManagerChatWidget } from "./ManagerChatWidget";
import { StaticLink } from "./StaticLink";

export function SiteFooterContent() {
  return (
    <footer>
      <StaticLink className="brand footer-brand" href="/">
        <span className="brand-mark">S</span>
        <span>SAFR</span>
      </StaticLink>
      <p>Путешествия, релокация и проверенные услуги в разных странах.</p>
      <div className="footer-links">
        <StaticLink href="/catalog">Направления</StaticLink>
        <StaticLink href="/privacy">Конфиденциальность</StaticLink>
        <StaticLink href="/account">Личный кабинет</StaticLink>
      </div>
      <span className="copyright">© 2026 SAFR</span>
    </footer>
  );
}

export function SiteFooter() {
  return (
    <>
      <SiteFooterContent />
      <ManagerChatWidget />
    </>
  );
}
