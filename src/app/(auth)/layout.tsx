import { BrandMark } from "@/components/layout/sidebar";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="on-band flex flex-1 items-center justify-center bg-band p-6">
      <div className="w-full max-w-sm space-y-6">
        <p className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <BrandMark />
          E2Square
        </p>
        <div className="on-light space-y-6 rounded-2xl bg-background p-6 shadow-xl shadow-black/30 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
