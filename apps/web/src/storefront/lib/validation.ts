import { normalizePhone } from '@posshope/shared';
import { useMemo } from 'react';
import { z } from 'zod';
import { useI18n } from '../i18n';
import type { Translate } from '../i18n/messages';

/**
 * Storefront form schemas with localized messages. They mirror the shared
 * account schemas but are rebuilt whenever the language changes, because zod
 * messages are fixed strings once a schema is created.
 */
export function createCustomerSchemas(t: Translate) {
  const phone = z
    .string()
    .trim()
    .min(1, t('validation.phone'))
    .max(30)
    .transform(normalizePhone)
    .refine((value) => /^\+?\d{8,15}$/.test(value), t('validation.phone'));

  const email = z.string().trim().toLowerCase().max(160).email(t('validation.email'));

  const optionalEmail = z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    email.optional(),
  );

  const password = z
    .string()
    .min(8, t('validation.passwordLength'))
    .max(200)
    .regex(/[A-Za-z]/u, t('validation.passwordLetter'))
    .regex(/\d/u, t('validation.passwordNumber'));

  const login = z
    .object({
      identifier: z.string().trim().min(3, t('validation.identifier')).max(160),
      password: z.string().min(1, t('validation.password')).max(200),
    })
    .strict();

  const register = z
    .object({
      name: z.string().trim().min(2, t('validation.name')).max(120),
      phone,
      email: optionalEmail,
      password,
    })
    .strict();

  const registerForm = register
    .extend({ confirmPassword: z.string() })
    .refine((value) => value.password === value.confirmPassword, {
      message: t('validation.mismatch'),
      path: ['confirmPassword'],
    });

  const profile = z
    .object({
      name: z.string().trim().min(2, t('validation.name')).max(120).optional(),
      email: z
        .preprocess(
          (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
          email.nullable(),
        )
        .optional(),
    })
    .strict();

  const changePassword = z
    .object({
      currentPassword: z.string().min(1, t('validation.currentPassword')).max(200),
      newPassword: password,
    })
    .strict();

  const changePasswordForm = changePassword
    .extend({ confirmPassword: z.string() })
    .refine((value) => value.newPassword === value.confirmPassword, {
      message: t('validation.mismatch'),
      path: ['confirmPassword'],
    });

  return { login, register, registerForm, profile, changePassword, changePasswordForm };
}

export type CustomerSchemas = ReturnType<typeof createCustomerSchemas>;

export function useCustomerSchemas(): CustomerSchemas {
  const { t } = useI18n();
  return useMemo(() => createCustomerSchemas(t), [t]);
}
