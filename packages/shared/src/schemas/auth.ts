import { z } from 'zod';
import { ROLES } from '../permissions.js';

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username is required').max(64),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  /** Optional terminal identifier, recorded in the audit log. */
  terminalId: z.string().trim().max(64).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(200),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(200)
      .regex(/[A-Za-z]/u, 'Password must contain a letter')
      .regex(/\d/u, 'Password must contain a number'),
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const roleSchema = z.enum(ROLES);
export type RoleInput = z.infer<typeof roleSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  fullName: z.string(),
  role: roleSchema,
  branchId: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authSessionSchema = z.object({
  user: authUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
  permissions: z.array(z.string()),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

/**
 * What a browser receives. The refresh token is deliberately absent: it only
 * ever travels in an `HttpOnly` cookie that page scripts cannot read.
 */
export type WebAuthSession = Omit<AuthSession, 'refreshToken'>;

/** Custom header every cookie-backed web auth call must carry (CSRF guard). */
export const WEB_CLIENT_HEADER = 'x-forno-client';
export const WEB_CLIENT_HEADER_VALUE = 'web';
