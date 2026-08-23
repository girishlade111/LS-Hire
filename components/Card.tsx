import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className }: CardProps) {
  return (
    <div
      className={`bg-panel border border-border rounded-card${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title: string;
  description?: string;
};

export function CardHeader({ title, description }: CardHeaderProps) {
  return (
    <div className="px-5 py-4 border-b border-border">
      <h2 className="text-body font-medium text-text">{title}</h2>
      {description ? (
        <p className="text-sub text-text-muted mt-1 max-w-md">{description}</p>
      ) : null}
    </div>
  );
}
