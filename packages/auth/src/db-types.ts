// Row types of the tables auth uses, taken from the generated client through @extas/db (no direct Prisma import).
import type { Prisma } from '@extas/db/client';

export type StaffUser = Prisma.StaffUserGetPayload<object>;
export type StaffSession = Prisma.StaffSessionGetPayload<object>;
export type StaffUserStatus = StaffUser['status'];
export type Customer = Prisma.CustomerGetPayload<object>;
export type CustomerSession = Prisma.CustomerSessionGetPayload<object>;
