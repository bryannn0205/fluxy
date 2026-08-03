export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-xl font-semibold tracking-tight">Fluxy</span>
        </div>
        {children}
      </div>
    </div>
  );
}
