import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Notice, Spinner, TextField } from '../components/ui';
import { useI18n } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { useActiveBranch } from '../lib/menu';
import { useCustomerSchemas } from '../lib/validation';
import { cartCount, useCart } from '../store/cart';
import { useSession } from '../store/session';

interface LoginValues {
  identifier: string;
  password: string;
}

interface RegisterValues {
  name: string;
  phone: string;
  email?: string;
  password: string;
  confirmPassword: string;
}

/** Only same-site paths are honoured, so `?next=` cannot send people elsewhere. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/account';
}

function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  footer: ReactNode;
}): ReactElement {
  const { t } = useI18n();
  const inCart = useCart((state) => cartCount(state.lines));
  return (
    <div className="page flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-md">
        <h1 className="display text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-3 text-cream-dim">{lead}</p>
        {inCart > 0 ? (
          <p className="mt-3 text-sm text-cream-faint">
            {t('auth.cartNote', { count: inCart })}
          </p>
        ) : null}
        <div className="mt-8">{children}</div>
        <div className="mt-8 border-t border-line pt-6 text-cream-dim">{footer}</div>
      </div>
    </div>
  );
}

export function LoginPage(): ReactElement {
  const { t } = useI18n();
  const schemas = useCustomerSchemas();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useSession((state) => state.status);
  const setCustomer = useSession((state) => state.setCustomer);
  const form = useForm<LoginValues>({ resolver: zodResolver(schemas.login) });

  const login = useMutation({
    mutationFn: (values: LoginValues) => api.account.login(values),
    onSuccess: (session) => {
      setCustomer(session.customer);
      navigate(next, { replace: true });
    },
  });

  if (status === 'signed-in' && !login.isSuccess) return <Navigate to={next} replace />;

  return (
    <AuthShell
      title={t('login.title')}
      lead={t('login.lead')}
      footer={
        <>
          {t('login.newHere')}{' '}
          <Link to={`/register?next=${encodeURIComponent(next)}`} className="link">
            {t('login.createAccount')}
          </Link>
          . {t('login.or')}{' '}
          <Link to="/meals" className="link">
            {t('login.orderWithout')}
          </Link>
          .
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values))}
        noValidate
        className="space-y-4"
      >
        <TextField
          label={t('login.identifier')}
          autoComplete="username"
          {...form.register('identifier')}
          error={form.formState.errors.identifier?.message}
        />
        <TextField
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        {login.error ? <Notice>{errorMessage(login.error)}</Notice> : null}
        <button type="submit" disabled={login.isPending} className="btn-primary h-12 w-full text-base">
          {login.isPending ? <Spinner /> : null}
          {t('login.submit')}
        </button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="link">
            {t('login.forgot')}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage(): ReactElement {
  const { t } = useI18n();
  const schemas = useCustomerSchemas();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const status = useSession((state) => state.status);
  const setCustomer = useSession((state) => state.setCustomer);
  const form = useForm<RegisterValues>({ resolver: zodResolver(schemas.registerForm) });

  const register = useMutation({
    mutationFn: (values: RegisterValues) => {
      const parsed = schemas.registerForm.parse(values);
      return api.account.register({
        name: parsed.name,
        phone: parsed.phone,
        password: parsed.password,
        ...(parsed.email ? { email: parsed.email } : {}),
      });
    },
    onSuccess: (session) => {
      setCustomer(session.customer);
      navigate(next, { replace: true });
    },
  });

  if (status === 'signed-in' && !register.isSuccess) return <Navigate to={next} replace />;
  const errors = form.formState.errors;

  return (
    <AuthShell
      title={t('register.title')}
      lead={t('register.lead')}
      footer={
        <>
          {t('register.already')}{' '}
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="link">
            {t('register.signIn')}
          </Link>
          .
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => register.mutate(values))}
        noValidate
        className="space-y-4"
      >
        <TextField
          label={t('register.name')}
          autoComplete="name"
          {...form.register('name')}
          error={errors.name?.message}
        />
        <TextField
          label={t('register.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          {...form.register('phone')}
          error={errors.phone?.message}
          hint={t('register.phoneHint')}
        />
        <TextField
          label={t('register.email')}
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={errors.email?.message}
        />
        <TextField
          label={t('register.password')}
          type="password"
          autoComplete="new-password"
          {...form.register('password')}
          error={errors.password?.message}
          hint={t('password.hint')}
        />
        <TextField
          label={t('register.confirmPassword')}
          type="password"
          autoComplete="new-password"
          {...form.register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
        {register.error ? <Notice>{errorMessage(register.error)}</Notice> : null}
        <button
          type="submit"
          disabled={register.isPending}
          className="btn-primary h-12 w-full text-base"
        >
          {register.isPending ? <Spinner /> : null}
          {t('register.submit')}
        </button>
      </form>
    </AuthShell>
  );
}

/**
 * There is no email or SMS service connected to the restaurant's system yet,
 * so a self-service reset link cannot be delivered. This page says so plainly
 * instead of pretending to send one.
 */
export function ForgotPasswordPage(): ReactElement {
  const { t } = useI18n();
  const { branch } = useActiveBranch();
  return (
    <AuthShell
      title={t('forgot.title')}
      lead={t('forgot.lead')}
      footer={
        <Link to="/login" className="link">
          {t('forgot.back')}
        </Link>
      }
    >
      <div className="space-y-4 text-cream-dim">
        <p>{t('forgot.body')}</p>
        {branch?.phone ? (
          <a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="btn-ghost">
            {t('forgot.call', { phone: branch.phone })}
          </a>
        ) : null}
        <p>
          {t('forgot.whileWaiting')}{' '}
          <Link to="/meals" className="link">
            {t('forgot.orderWithout')}
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
