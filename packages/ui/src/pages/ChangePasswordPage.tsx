import { Eye, EyeOff, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import cornerLogo from '../assets/corner-logo.svg';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/ui/badge';
import { LanguageToggle } from '../components/ui/language-toggle';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { toast } from '../components/ui/toast';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth';

/** Full-screen gate shown while the account still has a temporary password. */
export function ChangePasswordPage(): ReactElement {
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const applyCredentials = useAuthStore((state) => state.applyCredentials);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationError = useMemo(() => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return t('auth.changePassword.errors.required');
    }
    if (newPassword.length < 8) return t('auth.changePassword.errors.length');
    if (!/[A-Za-z]/u.test(newPassword) || !/\d/u.test(newPassword)) {
      return t('auth.changePassword.errors.strength');
    }
    if (newPassword === currentPassword) return t('auth.changePassword.errors.same');
    if (newPassword !== confirmPassword) return t('auth.changePassword.errors.mismatch');
    return null;
  }, [currentPassword, newPassword, confirmPassword, t]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      applyCredentials(result.user, result.permissions);
      toast.success(t('auth.changePassword.success'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('auth.changePassword.errors.failed'));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async (): Promise<void> => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  const inputType = showPasswords ? 'text' : 'password';
  const firstName = user?.fullName.split(' ').filter(Boolean)[0] ?? user?.fullName ?? '';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-5 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_0%,hsl(var(--accent)/0.14),transparent_65%)]"
      />
      <div className="absolute end-5 top-5 flex items-center gap-2">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-[440px]">
        <div className="mb-5 flex items-center justify-center gap-3">
          <img
            src={cornerLogo}
            alt=""
            className="h-11 w-11 shadow-lg ring-1 ring-border"
          />
          <div className="leading-tight">
            <p className="font-display text-xl tracking-[0.14em] text-foreground">
              {t('app.name')}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              {t('app.company')}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-pop sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <KeyRound className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-display text-[26px] uppercase leading-none tracking-[0.01em] text-foreground">
            {t('auth.changePassword.title')}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t('auth.changePassword.subtitle', { name: firstName })}
          </p>
          {user ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {user.username}
            </p>
          ) : null}

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">{t('auth.changePassword.current')}</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type={inputType}
                autoComplete="current-password"
                className="h-11"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={busy}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="newPassword">{t('auth.changePassword.new')}</Label>
                <button
                  type="button"
                  onClick={() => setShowPasswords((current) => !current)}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                  tabIndex={-1}
                >
                  {showPasswords ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {showPasswords ? t('auth.form.hidePassword') : t('auth.form.showPassword')}
                </button>
              </div>
              <Input
                id="newPassword"
                name="newPassword"
                type={inputType}
                autoComplete="new-password"
                className="h-11"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">{t('auth.changePassword.hint')}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">{t('auth.changePassword.confirm')}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={inputType}
                autoComplete="new-password"
                className="h-11"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={busy}
              />
            </div>

            {error ? (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="h-12 w-full text-[15px] font-semibold shadow-lg shadow-primary/15"
              disabled={busy}
            >
              {busy ? (
                <>
                  <Spinner className="border-current border-t-transparent" />
                  {t('auth.changePassword.submitting')}
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  {t('auth.changePassword.submit')}
                </>
              )}
            </Button>
          </form>

          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => void signOut()}
            disabled={busy}
          >
            <LogOut className="h-4 w-4 rtl:-scale-x-90" />
            {t('auth.changePassword.signOut')}
          </Button>
        </div>
      </div>
    </div>
  );
}
