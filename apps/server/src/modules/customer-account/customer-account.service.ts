import { Prisma } from '@prisma/client';
import {
  buildPaginated,
  normalizePhone,
  type CustomerAccountDto,
  type CustomerAddressDto,
  type CustomerAddressInput,
  type CustomerChangePasswordInput,
  type CustomerLoginInput,
  type CustomerProfileUpdateInput,
  type CustomerRegisterInput,
  type CustomerSessionDto,
  type Paginated,
  type PublicOrderDto,
} from '@posshope/shared';
import { env } from '../../env.js';
import { recordAuditSafe, type PrismaLike } from '../../lib/audit.js';
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../../lib/errors.js';
import { getDummyHash, hashPassword, verifyPassword } from '../../lib/password.js';
import { generateRefreshToken, hashToken, signCustomerToken } from '../../lib/tokens.js';
import { prisma } from '../../prisma.js';
import { publicOrderInclude, toPublicOrderDto } from '../online-store/online-payments.service.js';

/**
 * Website customer accounts.
 *
 * Customers authenticate against the `customers` table and `customer_sessions`,
 * never against staff `users`/`sessions`. Every query below is scoped by the
 * customer id taken from the verified token, so one customer can never read or
 * change another customer's profile, addresses or orders.
 */

export interface CustomerContext {
  ip?: string;
  userAgent?: string;
}

/** A session plus the refresh token that the route moves into a cookie. */
export interface IssuedCustomerSession {
  session: CustomerSessionDto;
  refreshToken: string;
}

type CustomerRow = Prisma.CustomerGetPayload<object>;

function toAccountDto(customer: CustomerRow): CustomerAccountDto {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email,
    registeredAt: (customer.registeredAt ?? customer.createdAt).toISOString(),
  };
}

function toAddressDto(address: Prisma.CustomerAddressGetPayload<object>): CustomerAddressDto {
  return {
    id: address.id,
    label: address.label,
    address: address.address,
    latitude: address.latitude,
    longitude: address.longitude,
    notes: address.notes,
    isDefault: address.isDefault,
  };
}

async function issueSession(
  customer: CustomerRow,
  context: CustomerContext,
  client: PrismaLike = prisma,
): Promise<IssuedCustomerSession> {
  const refreshToken = generateRefreshToken();
  const row = await client.customerSession.create({
    data: {
      customerId: customer.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  });
  const { token, expiresIn } = signCustomerToken({ sub: customer.id, sid: row.id });
  return {
    session: { customer: toAccountDto(customer), accessToken: token, accessTokenExpiresIn: expiresIn },
    refreshToken,
  };
}

export async function register(
  input: CustomerRegisterInput,
  context: CustomerContext = {},
): Promise<IssuedCustomerSession> {
  const existing = await prisma.customer.findUnique({ where: { phone: input.phone } });
  if (existing?.passwordHash) {
    throw new ConflictError('An account with this phone number already exists. Try signing in.');
  }
  if (input.email) {
    const emailOwner = await prisma.customer.findUnique({ where: { email: input.email } });
    if (emailOwner && emailOwner.id !== existing?.id) {
      throw new ConflictError('An account with this email address already exists');
    }
  }

  const passwordHash = await hashPassword(input.password);
  const account = {
    name: input.name,
    email: input.email ?? null,
    passwordHash,
    registeredAt: new Date(),
    lastLoginAt: new Date(),
  };

  try {
    return await prisma.$transaction(async (tx) => {
      // A guest profile created at the till for the same phone is upgraded in
      // place. Its earlier orders stay with staff: the account area only lists
      // orders placed after `registeredAt`.
      const customer = existing
        ? await tx.customer.update({ where: { id: existing.id }, data: account })
        : await tx.customer.create({ data: { ...account, phone: input.phone } });
      await recordAuditSafe(
        {
          action: 'customer.registered',
          entityType: 'Customer',
          entityId: customer.id,
          after: { claimedGuestProfile: Boolean(existing) },
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
        tx,
      );
      return issueSession(customer, context, tx);
    });
  } catch (error) {
    // Two simultaneous sign-ups for the same phone or email.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('An account with these details already exists. Try signing in.');
    }
    throw error;
  }
}

const BAD_CREDENTIALS = 'Incorrect phone number, email or password';

export async function login(
  input: CustomerLoginInput,
  context: CustomerContext = {},
): Promise<IssuedCustomerSession> {
  const identifier = input.identifier.trim();
  const customer = identifier.includes('@')
    ? await prisma.customer.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.customer.findUnique({ where: { phone: normalizePhone(identifier) } });

  // Guest profiles have no password. Burn the same time either way so the
  // response does not reveal whether an account exists.
  if (!customer?.passwordHash) {
    await verifyPassword(input.password, await getDummyHash());
    throw new UnauthenticatedError(BAD_CREDENTIALS);
  }

  if (customer.lockedUntil && customer.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((customer.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new UnauthenticatedError(
      `Too many failed attempts. Try again in ${minutes} minute(s)`,
    );
  }

  if (!(await verifyPassword(input.password, customer.passwordHash))) {
    const attempts = customer.failedLoginAttempts + 1;
    const lock = attempts >= env.MAX_LOGIN_ATTEMPTS;
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000) : null,
      },
    });
    throw new UnauthenticatedError(
      lock
        ? `Too many failed attempts. Try again in ${env.LOGIN_LOCK_MINUTES} minutes`
        : BAD_CREDENTIALS,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id: customer.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return issueSession(updated, context, tx);
  });
}

/** Rotates the refresh token: the old session is revoked, a new one issued. */
export async function refresh(
  refreshToken: string,
  context: CustomerContext = {},
): Promise<IssuedCustomerSession> {
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { customer: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.customer.passwordHash
  ) {
    throw new UnauthenticatedError('Your session is no longer valid. Please sign in again.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.customerSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return issueSession(session.customer, context, tx);
  });
}

export async function logoutByRefreshToken(refreshToken: string): Promise<void> {
  await prisma.customerSession.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function loadAccount(customerId: string): Promise<CustomerRow> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer?.passwordHash) throw new UnauthenticatedError();
  return customer;
}

export async function getAccount(customerId: string): Promise<CustomerAccountDto> {
  return toAccountDto(await loadAccount(customerId));
}

export async function updateProfile(
  customerId: string,
  input: CustomerProfileUpdateInput,
): Promise<CustomerAccountDto> {
  await loadAccount(customerId);
  if (input.email) {
    const owner = await prisma.customer.findUnique({ where: { email: input.email } });
    if (owner && owner.id !== customerId) {
      throw new ConflictError('An account with this email address already exists');
    }
  }
  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
  });
  return toAccountDto(updated);
}

/** Changes the password and signs every other device out. */
export async function changePassword(
  customerId: string,
  input: CustomerChangePasswordInput,
  context: CustomerContext = {},
): Promise<IssuedCustomerSession> {
  const customer = await loadAccount(customerId);
  if (!(await verifyPassword(input.currentPassword, customer.passwordHash!))) {
    throw new ValidationError('The current password is incorrect');
  }
  if (await verifyPassword(input.newPassword, customer.passwordHash!)) {
    throw new ConflictError('The new password must be different from the current one');
  }
  const passwordHash = await hashPassword(input.newPassword);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({ where: { id: customerId }, data: { passwordHash } });
    await tx.customerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAuditSafe(
      { action: 'customer.password.changed', entityType: 'Customer', entityId: customerId },
      tx,
    );
    return issueSession(updated, context, tx);
  });
}

// --- Addresses ---------------------------------------------------------------

const MAX_ADDRESSES = 10;

export async function listAddresses(customerId: string): Promise<CustomerAddressDto[]> {
  const rows = await prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toAddressDto);
}

export async function createAddress(
  customerId: string,
  input: CustomerAddressInput,
): Promise<CustomerAddressDto> {
  return prisma.$transaction(async (tx) => {
    const count = await tx.customerAddress.count({ where: { customerId } });
    if (count >= MAX_ADDRESSES) {
      throw new ConflictError(`You can save up to ${MAX_ADDRESSES} addresses`);
    }
    // The first address is the default; otherwise only when asked.
    const isDefault = count === 0 || input.isDefault === true;
    if (isDefault) {
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const row = await tx.customerAddress.create({
      data: {
        customerId,
        label: input.label,
        address: input.address,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        notes: input.notes ?? null,
        isDefault,
      },
    });
    return toAddressDto(row);
  });
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  input: CustomerAddressInput,
): Promise<CustomerAddressDto> {
  return prisma.$transaction(async (tx) => {
    // Ownership: the row must belong to the caller, whatever id was sent.
    const existing = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!existing) throw new NotFoundError('Address not found');
    if (input.isDefault === true) {
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    const row = await tx.customerAddress.update({
      where: { id: existing.id },
      data: {
        label: input.label,
        address: input.address,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        notes: input.notes ?? null,
        ...(input.isDefault === true ? { isDefault: true } : {}),
      },
    });
    return toAddressDto(row);
  });
}

export async function deleteAddress(customerId: string, addressId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!existing) throw new NotFoundError('Address not found');
    await tx.customerAddress.delete({ where: { id: existing.id } });
    if (existing.isDefault) {
      const next = await tx.customerAddress.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

// --- Orders ------------------------------------------------------------------

/** Orders the signed-in customer placed since they created their account. */
function ownOrdersWhere(customer: CustomerRow): Prisma.OrderWhereInput {
  return {
    customerId: customer.id,
    createdAt: { gte: customer.registeredAt ?? customer.createdAt },
  };
}

export async function listOrders(
  customerId: string,
  page: number,
  pageSize: number,
): Promise<Paginated<PublicOrderDto>> {
  const customer = await loadAccount(customerId);
  const where = ownOrdersWhere(customer);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: publicOrderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return buildPaginated(rows.map(toPublicOrderDto), total, page, pageSize);
}

export async function getOrder(customerId: string, orderNumber: string): Promise<PublicOrderDto> {
  const customer = await loadAccount(customerId);
  const row = await prisma.order.findFirst({
    where: { ...ownOrdersWhere(customer), orderNumber },
    include: publicOrderInclude,
  });
  // Someone else's order number looks exactly like one that does not exist.
  if (!row) throw new NotFoundError('Order not found');
  return toPublicOrderDto(row);
}
