"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  disabled,
}: OtpInputProps) {
  const inputsRef = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = React.useMemo(() => {
    const arr = value.split("").slice(0, length);
    while (arr.length < length) arr.push("");
    return arr;
  }, [value, length]);

  function setDigit(index: number, char: string) {
    const next = [...digits];
    next[index] = char;
    onChange(next.join(""));
  }

  function handleChange(index: number, raw: string) {
    const char = raw.replace(/\D/g, "").slice(-1);
    setDigit(index, char);
    if (char && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        inputsRef.current[index - 1]?.focus();
        setDigit(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(length, "").slice(0, length));
    const lastIndex = Math.min(pasted.length, length - 1);
    inputsRef.current[lastIndex]?.focus();
  }

  return (
    <div className="flex justify-center gap-3" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          className={cn("otp-box", error && "border-brand-error focus:ring-brand-error/20")}
        />
      ))}
    </div>
  );
}
