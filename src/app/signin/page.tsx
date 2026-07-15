"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Wind } from "lucide-react";
import { signIn } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/lib/i18n/LanguageSwitcher";
import { btnPrimary, cardClass, inputClass, labelClass } from "@/lib/ui";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  // Set when the dashboard layout signs out a mid-session deactivated user.
  const deactivated = searchParams.get("deactivated") === "1";
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await signIn(formData);

    // On success, signIn() redirects server-side and never returns here.
    // The action returns a stable error CODE (a dictionary key), which we
    // translate for display.
    if (!result.success) {
      setError(t(result.error as keyof Dictionary));
    }

    setIsSubmitting(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`w-full max-w-sm ${cardClass} p-8`}>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="h-6 w-6 text-blue-600" strokeWidth={2} />
            <h1 className="text-xl font-semibold text-slate-900">{t("signin.title")}</h1>
          </div>
          <LanguageSwitcher />
        </div>

        {deactivated && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {t("signin.deactivated")}
          </p>
        )}

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("signin.email")}</label>
            <input name="email" type="email" required dir="ltr" className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("signin.password")}</label>
            <input name="password" type="password" required className={inputClass} />
          </div>

          <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
            {isSubmitting ? t("signin.submitting") : t("signin.submit")}
          </button>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  );
}
