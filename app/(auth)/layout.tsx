import { FluxyLogo } from "@/components/common/FluxyLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <FluxyLogo />
        </div>
        {children}
      </div>
    </div>
  );
}
