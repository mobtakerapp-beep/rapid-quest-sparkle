import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GlobalNav } from "@/components/GlobalNav";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectContent } from "@/components/ProtectContent";
import { EventReminderWatcher } from "@/components/EventReminderWatcher";
import { TickerWithRole } from "@/components/NewsTicker";
import { DhikrReminder } from "@/components/DhikrReminder";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LiveClock } from "@/components/LiveClock";
import { PageProgressBar } from "@/components/PageProgressBar";
import { ScrollToTop } from "@/components/ScrollToTop";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          حدث خطأ في التحميل
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ ما. يمكنك المحاولة مرة أخرى أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            حاول مجدداً
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const channel = supabase
      .channel("schema-db-changes")
      .on("postgres_changes", { event: "*", schema: "public" }, () => {
        queryClient.invalidateQueries();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  useEffect(() => {
    const AR = "٠١٢٣٤٥٦٧٨٩";
    const SKIP = new Set([
      "email", "password", "number", "tel", "url",
      "date", "time", "datetime-local", "month", "week",
      "color", "range", "file", "hidden",
    ]);
    const nativeInputSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, "value"
    )?.set;
    const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype, "value"
    )?.set;

    let busy = false;
    const handler = (e: Event) => {
      if (busy) return;
      const el = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
      if (el instanceof HTMLInputElement && SKIP.has(el.type)) return;
      const val = el.value;
      const converted = val.replace(/[0-9]/g, (d) => AR[Number(d)]);
      if (converted === val) return;
      const pos = el.selectionStart;
      busy = true;
      if (el instanceof HTMLTextAreaElement) {
        nativeTextareaSetter?.call(el, converted);
      } else {
        nativeInputSetter?.call(el, converted);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      busy = false;
      if (pos !== null) {
        requestAnimationFrame(() => {
          try { el.setSelectionRange(pos, pos); } catch {}
        });
      }
    };

    document.addEventListener("input", handler, true);
    return () => document.removeEventListener("input", handler, true);
  }, []);

  return (
    <LanguageProvider>
      <ThemeProvider />
      <ProtectContent />
      <EventReminderWatcher />
      <DhikrReminder />
      <PageProgressBar />
      {/* Fixed top bar: news ticker only — clock moved into GlobalNav */}
      <div className="fixed top-0 left-0 right-0 z-[155]">
        <TickerWithRole />
      </div>
      <div className="app-content-with-nav">
        <Outlet />
      </div>
      <GlobalNav />
      <ScrollToTop />
      <Toaster position="top-center" richColors dir="rtl" />
    </LanguageProvider>
  );
}
