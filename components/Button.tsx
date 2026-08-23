import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "default" | "danger" | "accent" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-panel-2 border border-border text-text hover:bg-panel-3 hover:border-text-faint",
  danger: "bg-panel-2 border border-border text-danger hover:border-danger",
  accent: "bg-panel-2 border border-accent text-accent",
  ghost:
    "border border-transparent text-text-muted hover:text-text hover:bg-panel-2"
};

export function Button({
  children,
  variant = "default",
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`text-label rounded-control px-3.5 py-1.5 transition-colors duration-150 ${
        variantClasses[variant]
      }${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
}
