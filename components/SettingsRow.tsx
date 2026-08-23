import type { ReactNode } from "react";

type SettingsRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
  last?: boolean;
};

export function SettingsRow({
  title,
  description,
  children,
  last
}: SettingsRowProps) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4${
        last ? "" : " border-b border-border"
      }`}
    >
      <div className="max-w-sm">
        <span className="text-label text-text">{title}</span>
        {description ? (
          <p className="text-sub text-text-muted mt-0.5">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
