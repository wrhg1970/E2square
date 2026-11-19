export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-lg font-semibold tracking-tight">E2Square</p>
        {children}
      </div>
    </main>
  );
}
