import { authenticatedMiddleware } from '@/app/utils/rbac/middleware/authenticated';
import { useUsersStore } from '@/features/settings/users/users.store';
import { useSettingsStore } from '@/app/stores/settings.store';
import { VIEWS } from '@/app/constants';
import { UserManagementAuthenticationMethod } from '@/Interface';
import type { RouteLocationNormalized } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/features/settings/users/users.store', () => ({
	useUsersStore: vi.fn(),
}));

vi.mock('@/app/stores/settings.store', () => ({
	useSettingsStore: vi.fn(),
}));

describe('Middleware', () => {
	describe('authenticated', () => {
		beforeEach(() => {
			setActivePinia(createPinia());
			vi.mocked(useSettingsStore).mockReturnValue({
				userManagement: {
					authenticationMethod: UserManagementAuthenticationMethod.Email,
				},
			} as unknown as ReturnType<typeof useSettingsStore>);
			sessionStorage.clear();
		});

		it('should redirect to signin if no current user is present', async () => {
			vi.mocked(useUsersStore).mockReturnValue({ currentUser: null } as ReturnType<
				typeof useUsersStore
			>);

			const nextMock = vi.fn();
			const toMock = { query: {} } as RouteLocationNormalized;
			const fromMock = {} as RouteLocationNormalized;

			await authenticatedMiddleware(toMock, fromMock, nextMock, {});

			expect(nextMock).toHaveBeenCalledWith({
				name: VIEWS.SIGNIN,
				query: { redirect: encodeURIComponent('/') },
			});
		});

		it('should call next with the correct redirect query if present', async () => {
			vi.mocked(useUsersStore).mockReturnValue({ currentUser: null } as ReturnType<
				typeof useUsersStore
			>);

			const nextMock = vi.fn();
			const toMock = { query: { redirect: '/' } } as unknown as RouteLocationNormalized;
			const fromMock = {} as RouteLocationNormalized;

			await authenticatedMiddleware(toMock, fromMock, nextMock, {});

			expect(nextMock).toHaveBeenCalledWith({
				name: VIEWS.SIGNIN,
				query: { redirect: '/' },
			});
		});

		it('should allow navigation if a current user is present', async () => {
			vi.mocked(useUsersStore).mockReturnValue({ currentUser: { id: '123' } } as ReturnType<
				typeof useUsersStore
			>);

			const nextMock = vi.fn();
			const toMock = { query: {} } as RouteLocationNormalized;
			const fromMock = {} as RouteLocationNormalized;

			await authenticatedMiddleware(toMock, fromMock, nextMock, {});

			expect(nextMock).not.toHaveBeenCalled();
		});

		it('should reload page when cognito is enabled and user is not authenticated', async () => {
			vi.mocked(useUsersStore).mockReturnValue({ currentUser: null } as ReturnType<
				typeof useUsersStore
			>);
			vi.mocked(useSettingsStore).mockReturnValue({
				userManagement: {
					authenticationMethod: UserManagementAuthenticationMethod.Cognito,
				},
			} as unknown as ReturnType<typeof useSettingsStore>);

			const reloadMock = vi.fn();
			Object.defineProperty(window, 'location', {
				value: { ...window.location, reload: reloadMock },
				writable: true,
			});

			const nextMock = vi.fn();
			const toMock = { query: {} } as RouteLocationNormalized;
			const fromMock = {} as RouteLocationNormalized;

			await authenticatedMiddleware(toMock, fromMock, nextMock, {});

			expect(reloadMock).toHaveBeenCalled();
			expect(nextMock).not.toHaveBeenCalled();
		});

		it('should redirect to signin after reload already attempted with cognito', async () => {
			vi.mocked(useUsersStore).mockReturnValue({ currentUser: null } as ReturnType<
				typeof useUsersStore
			>);
			vi.mocked(useSettingsStore).mockReturnValue({
				userManagement: {
					authenticationMethod: UserManagementAuthenticationMethod.Cognito,
				},
			} as unknown as ReturnType<typeof useSettingsStore>);

			sessionStorage.setItem('n8n_cognito_reload', '1');

			const nextMock = vi.fn();
			const toMock = { query: {} } as RouteLocationNormalized;
			const fromMock = {} as RouteLocationNormalized;

			await authenticatedMiddleware(toMock, fromMock, nextMock, {});

			expect(nextMock).toHaveBeenCalledWith({
				name: VIEWS.SIGNIN,
				query: { redirect: encodeURIComponent('/') },
			});
		});
	});
});
