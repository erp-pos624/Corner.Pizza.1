import { initLanguage, initTheme } from '@posshope/ui/boot';
import { isManagementPath } from './sections';
import { initCustomerTheme } from './storefront/theme';

// Runs before React mounts. Staff theme and language preferences are applied
// only on staff routes; the customer site owns its own language and theme.
if (isManagementPath(window.location.pathname)) {
  initTheme();
  initLanguage();
} else {
  initCustomerTheme();
}
