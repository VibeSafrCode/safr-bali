import type { AnchorHTMLAttributes, ReactNode } from "react";

type StaticLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
};

function staticHref(href: string) {
  if (
    href === "/" ||
    href.endsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("http") ||
    href.startsWith("/api/")
  ) {
    return href;
  }
  return `${href}/`;
}

// Production is a static Nginx export. A plain anchor deliberately performs a
// full document request instead of asking the Next client router for RSC data.
export function StaticLink({ href, children, ...props }: StaticLinkProps) {
  return (
    <a href={staticHref(href)} {...props}>
      {children}
    </a>
  );
}
