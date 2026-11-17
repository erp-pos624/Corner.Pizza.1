import type { CustomerAccountDto } from '@posshope/shared';
import { create } from 'zustand';
import { api, setSessionLostHandler } from '../lib/api';

interface SessionState {
  status: 'loading' | 'guest' | 'signed-in';
  customer: CustomerAccountDto | null;
  bootstrap: () => Promise<void>;
  setCustomer: (customer: CustomerAccountDto) => void;
  signOut: () => Promise<void>;
}

/**
 * Who is using the site. Only the profile is kept here; tokens stay inside
 * `lib/api.ts`. This drives navigation and guards, nothing more: the server
 * decides what a request may do from its own verified token.
 */
export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  customer: null,

  bootstrap: async () => {
    const session = await api.account.restore();
    set(session ? { status: 'signed-in', customer: session.customer } : { status: 'guest' });
  },

  setCustomer: (customer) => set({ status: 'signed-in', customer }),

  signOut: async () => {
    try {
      await api.account.logout();
    } finally {
      set({ status: 'guest', customer: null });
    }
  },
}));

setSessionLostHandler(() => useSession.setState({ status: 'guest', customer: null }));
