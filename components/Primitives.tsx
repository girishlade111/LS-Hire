import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes
} from "react";

type BadgeTone = "success" | "danger" | "muted" | "accent";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
};

const badgeToneClasses: Record<BadgeTone, string> = {
  success: "border-success text-success",
  danger: "border-danger text-danger",
  muted: "border-border text-text-muted",
  accent: "border-accent text-accent"
};

export function Badge({ children, tone = "muted" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
        badgeToneClasses[tone]
      }`}
    >
      {children}
    </span>
  );
}

export function Input({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`bg-panel-2 border border-border rounded-control px-3 py-1.5 text-body text-text placeholder:text-text-faint${
        className ? ` ${className}` : ""
      }`}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ children, className, ...rest }: SelectProps) {
  return (
    <select
      {...rest}
      className={`bg-panel-2 border border-border rounded-control px-3 py-1.5 text-body text-text${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </select>
  );
}
