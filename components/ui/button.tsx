import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isLoading?: boolean;
  loadingText?: string;
};

export function Button({
  className,
  isLoading,
  disabled,
  children,
  loadingText,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("ta-button", className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? loadingText ?? "Signing in..." : children}
    </button>
  );
}
