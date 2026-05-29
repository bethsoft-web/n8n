import type { RouterMiddleware } from '@/app/types/router';
import { VIEWS } from '@/app/constants';
import type { AuthenticatedPermissionOptions } from '@/app/types/rbac';
import { isAuthenticated, shouldEnableMfa } from '@/app/utils/rbac/checks';
import { useSettingsStore } from '@/app/stores/settings.store';
import { UserManagementAuthenticationMethod } from '@/Interface';

const COGNITO_RELOAD_KEY = 'n8n_cognito_reload';

export const authenticatedMiddleware: RouterMiddleware<AuthenticatedPermissionOptions> = async (
	to,
	_from,
	next,
	options,
) => {
	// ensure that we are removing the already existing redirect query parameter
	// to avoid infinite redirect loops
	const url = new URL(window.location.href);
	url.searchParams.delete('redirect');
	const redirect = to.query.redirect ?? encodeURIComponent(`${url.pathname}${url.search}`);

	const valid = isAuthenticated(options);
	if (!valid) {
		const settingsStore = useSettingsStore();
		const isCognito =
			settingsStore.userManagement.authenticationMethod ===
			UserManagementAuthenticationMethod.Cognito;

		if (isCognito) {
			const reloadCount = parseInt(sessionStorage.getItem(COGNITO_RELOAD_KEY) ?? '0', 10);
			if (reloadCount < 1) {
				sessionStorage.setItem(COGNITO_RELOAD_KEY, String(reloadCount + 1));
				window.location.reload();
				return;
			}
		}

		return next({ name: VIEWS.SIGNIN, query: { redirect } });
	}

	sessionStorage.removeItem(COGNITO_RELOAD_KEY);

	// If MFA is not enabled, and the instance enforces MFA, redirect to personal settings
	const mfaNeeded = shouldEnableMfa();
	if (mfaNeeded) {
		if (to.name !== VIEWS.PERSONAL_SETTINGS) {
			return next({ name: VIEWS.PERSONAL_SETTINGS, query: { redirect } });
		}
		return;
	}
};
