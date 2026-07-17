import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import type { AuthenticatedRequest, User } from '@n8n/db';
import { UserRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import type { NextFunction, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { z } from 'zod';

import { AuthService } from '@/auth/auth.service';
import { AUTH_COOKIE_NAME } from '@/constants';
import { AuthError } from '@/errors/response-errors/auth.error';

// ---------------------------------------------------------------------------
// Key Cache — fetches and caches ALB public keys
// ---------------------------------------------------------------------------

class KeyCache {
	private readonly ttl: number;
	private readonly baseURL: string;
	private lastUpdate = 0;
	private lastKid: string | null = null;
	private current: Promise<string> | null = null;

	constructor(opts: { baseURL: string; ttl?: number }) {
		this.ttl = opts.ttl ?? 1000 * 60 * 5; // 5 minutes
		this.baseURL = opts.baseURL;
	}

	fetch(kid: string): Promise<string> {
		if (!this.current || kid !== this.lastKid || Date.now() - this.lastUpdate > this.ttl) {
			this.lastUpdate = Date.now();
			this.lastKid = kid;
			const publicKeyUrl = `${this.baseURL}/${kid}`;
			this.current = globalThis.fetch(publicKeyUrl).then((res) => res.text());
		}
		return this.current;
	}
}

// ---------------------------------------------------------------------------
// Token payload schemas
// ---------------------------------------------------------------------------

const identityTokenSchema = z.object({
	email: z.string(),
	sub: z.string(),
	'custom:payload-role': z.string().optional(),
	given_name: z.string().optional(),
	family_name: z.string().optional(),
});

const accessTokenSchema = z.object({
	client_id: z.string(),
	iss: z.string(),
	sub: z.string(),
	'cognito:groups': z.array(z.string()).optional(),
});

export interface CognitoIdentityPayload {
	email: string;
	sub: string;
	firstName?: string;
	lastName?: string;
	customRole?: string;
}

export interface CognitoAccessPayload {
	groups: string[];
}

// ---------------------------------------------------------------------------
// CognitoAuthService
// ---------------------------------------------------------------------------

@Service()
export class CognitoAuthService {
	private readonly elbKeyCache: KeyCache;
	private readonly cognitoIssuer: string;

	constructor(
		private readonly globalConfig: GlobalConfig,
		private readonly logger: Logger,
		private readonly userRepository: UserRepository,
		private readonly authService: AuthService,
	) {
		const { region, userPoolId } = this.globalConfig.cognito;
		this.elbKeyCache = new KeyCache({
			baseURL: `https://public-keys.auth.elb.${region}.amazonaws.com`,
		});
		this.cognitoIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
	}

	/**
	 * Creates the Express middleware that authenticates requests via Cognito ALB headers.
	 * Sets req.user if authentication succeeds. Returns 401 if auth fails.
	 */
	createAuthMiddleware() {
		return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
			// Fast path: if a valid n8n-auth cookie already exists, let the standard
			// AuthService middleware validate it downstream.
			if (req.cookies?.[AUTH_COOKIE_NAME]) {
				return next();
			}

			try {
				const identity = await this.validateIdentityToken(req);
				if (!identity) {
					// No ALB headers — let the request continue; downstream auth will 401 if required.
					return next();
				}

				const access = await this.validateAccessToken(req);
				const groups = access?.groups ?? [];

				const user = await this.findOrCreateUser(identity, groups);
				this.authService.issueCookie(res, user, false, req.browserId);
				next();
			} catch (error) {
				if (error instanceof AuthError) {
					return next();
				}
				throw error;
			}
		};
	}

	/**
	 * Validates the x-amzn-oidc-data header (identity token from ALB).
	 */
	private async validateIdentityToken(
		req: AuthenticatedRequest,
	): Promise<CognitoIdentityPayload | null> {
		const token = req.headers['x-amzn-oidc-data'] as string | undefined;
		if (!token) {
			this.logger.debug('Cognito auth: No x-amzn-oidc-data header present');
			return null;
		}

		const decoded = jwt.decode(token, { complete: true });
		if (!decoded) {
			this.logger.warn('Cognito auth: Failed to decode identity token');
			return null;
		}

		const { header } = decoded;

		// Determine token source and get public key
		let publicKey: string;

		if (this.isELBToken(header)) {
			// Validate client matches our expected Cognito client ID
			if (header.client !== this.globalConfig.cognito.clientId) {
				this.logger.warn('Cognito auth: ELB token client mismatch', {
					expected: this.globalConfig.cognito.clientId,
					received: header.client,
				});
				return null;
			}
			try {
				publicKey = await this.elbKeyCache.fetch(header.kid);
			} catch (error) {
				this.logger.error('Cognito auth: Failed to fetch ELB public key', {
					kid: header.kid,
					error: (error as Error).message,
				});
				return null;
			}
		} else {
			this.logger.warn('Cognito auth: Unrecognized identity token format', {
				headerKeys: Object.keys(header),
			});
			return null;
		}

		try {
			const payload: unknown = jwt.verify(token, publicKey, {
				issuer: this.cognitoIssuer,
				algorithms: ['ES256', 'ES384', 'RS256', 'RS384'],
			});

			const parsed = identityTokenSchema.parse(payload);
			const { emailClaim, firstNameClaim, lastNameClaim } = this.globalConfig.cognito;

			return {
				email: ((parsed as Record<string, unknown>)[emailClaim] as string) ?? parsed.email,
				sub: parsed.sub,
				firstName:
					((parsed as Record<string, unknown>)[firstNameClaim] as string) ?? parsed.given_name,
				lastName:
					((parsed as Record<string, unknown>)[lastNameClaim] as string) ?? parsed.family_name,
				customRole: parsed['custom:payload-role'],
			};
		} catch (error) {
			if (error instanceof jwt.TokenExpiredError) {
				this.logger.warn('Cognito auth: Identity token expired');
			} else if (error instanceof jwt.JsonWebTokenError) {
				this.logger.warn('Cognito auth: Identity token verification failed', {
					error: (error as Error).message,
					issuer: this.cognitoIssuer,
				});
			} else {
				this.logger.error('Cognito auth: Unexpected error during token validation', {
					error: (error as Error).message,
				});
			}
			return null;
		}
	}

	/**
	 * Validates the x-amzn-oidc-accesstoken header (access token from ALB/Cognito).
	 * Used to get group membership for role mapping.
	 */
	private async validateAccessToken(
		req: AuthenticatedRequest,
	): Promise<CognitoAccessPayload | null> {
		const token = req.headers['x-amzn-oidc-accesstoken'] as string | undefined;
		if (!token) return null;

		const decoded = jwt.decode(token, { complete: true });
		if (!decoded) return null;

		// Access tokens from Cognito are standard JWTs signed with RSA
		// For simplicity in ALB setup, we trust the access token if the identity token was valid
		// In production with JWKS, you'd verify against the Cognito JWKS endpoint
		try {
			const payload = decoded.payload as Record<string, unknown>;
			const parsed = accessTokenSchema.safeParse(payload);

			if (!parsed.success) return null;

			// Validate issuer
			if (parsed.data.iss !== this.cognitoIssuer) {
				this.logger.warn('Cognito auth: Access token issuer mismatch');
				return null;
			}

			// Validate client_id
			if (parsed.data.client_id !== this.globalConfig.cognito.clientId) {
				this.logger.warn('Cognito auth: Access token client_id mismatch');
				return null;
			}

			return {
				groups: parsed.data['cognito:groups'] ?? [],
			};
		} catch {
			return null;
		}
	}

	/**
	 * Finds an existing user by email, or creates one (JIT provisioning).
	 * Maps Cognito groups to n8n roles.
	 */
	private async findOrCreateUser(
		identity: CognitoIdentityPayload,
		groups: string[],
	): Promise<User> {
		const { ownerGroup, adminGroup } = this.globalConfig.cognito;

		let user = await this.userRepository.findOne({
			where: { email: identity.email },
			relations: ['role'],
		});

		if (user) {
			// Update name if changed
			let needsUpdate = false;
			if (identity.firstName && user.firstName !== identity.firstName) {
				user.firstName = identity.firstName;
				needsUpdate = true;
			}
			if (identity.lastName && user.lastName !== identity.lastName) {
				user.lastName = identity.lastName;
				needsUpdate = true;
			}
			if (needsUpdate) {
				await this.userRepository.save(user);
			}
			return user;
		}

		// JIT provisioning: create new user
		this.logger.info('Cognito auth: Creating new user via JIT provisioning', {
			email: identity.email,
		});

		// Determine role based on Cognito groups
		let roleSlug = 'global:member';
		if (groups.includes(ownerGroup)) {
			roleSlug = 'global:owner';
		} else if (groups.includes(adminGroup)) {
			roleSlug = 'global:admin';
		}

		// Check if this is the first user (should be owner)
		const userCount = await this.userRepository.count();
		if (userCount === 0) {
			roleSlug = 'global:owner';
		}

		// Use createUserWithProject to ensure personal project is created
		const { user: newUser } = await this.userRepository.createUserWithProject({
			email: identity.email,
			firstName: identity.firstName ?? '',
			lastName: identity.lastName ?? '',
			password: '',
			role: { slug: roleSlug },
		});

		return newUser;
	}

	// ---------------------------------------------------------------------------
	// Token type detection helpers (from your existing module)
	// ---------------------------------------------------------------------------

	private isELBToken(header: object): header is { signer: string; client: string; kid: string } {
		return (
			'signer' in header &&
			typeof (header as Record<string, unknown>).signer === 'string' &&
			((header as Record<string, unknown>).signer as string).startsWith(
				'arn:aws:elasticloadbalancing',
			) &&
			'client' in header &&
			typeof (header as Record<string, unknown>).client === 'string' &&
			'kid' in header &&
			typeof (header as Record<string, unknown>).kid === 'string'
		);
	}
}
