import { Config, Env } from '../decorators';

@Config
export class CognitoConfig {
	/** AWS Region for key endpoints (e.g., 'us-east-1'). */
	@Env('AWS_REGION')
	region: string = 'us-east-1';

	/** Cognito User Pool ID (e.g., 'us-east-1_xxxxxxxxx'). */
	@Env('COGNITO_USER_POOL_ID')
	userPoolId: string = '';

	/** Cognito App Client ID for audience validation. */
	@Env('COGNITO_CLIENT_ID')
	clientId: string = '';

	/**
	 * Cognito group name that maps to the n8n owner role.
	 * Users in this group get 'global:owner'. All others get 'global:member'.
	 */
	@Env('N8N_COGNITO_OWNER_GROUP')
	ownerGroup: string = 'n8n-owners';

	/**
	 * Cognito group name that maps to the n8n admin role.
	 * Users in this group get 'global:admin'. Falls back to 'global:member' if not matched.
	 */
	@Env('N8N_COGNITO_ADMIN_GROUP')
	adminGroup: string = 'n8n-admins';

	/** Claim name for email in the identity token. */
	@Env('N8N_COGNITO_EMAIL_CLAIM')
	emailClaim: string = 'email';

	/** Claim name for first name in the identity token. */
	@Env('N8N_COGNITO_FIRST_NAME_CLAIM')
	firstNameClaim: string = 'given_name';

	/** Claim name for last name in the identity token. */
	@Env('N8N_COGNITO_LAST_NAME_CLAIM')
	lastNameClaim: string = 'family_name';
}
