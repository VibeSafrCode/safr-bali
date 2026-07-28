"use client";

type RouteContext = {
  country?: string;
  city?: string;
  section?: string;
  service?: string;
};

export function ManagerButton({
  className,
  context,
  children,
}: {
  className?: string;
  context?: RouteContext;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("safr:manager", { detail: context ?? {} }),
        );
      }}
    >
      {children}
    </button>
  );
}
