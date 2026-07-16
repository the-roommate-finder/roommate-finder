import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.6 5.6 0 0 1-2.4 3.65v3h3.86c2.26-2.09 3.56-5.17 3.56-8.89Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.86-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.28a12 12 0 0 0 0 10.8l3.99-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.28 6.6l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="lg" className="w-full">
      <GoogleIcon />
      {label}
    </Button>
  );
}
