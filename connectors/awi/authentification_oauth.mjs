/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file authentification.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short English language parser based on Compromise
*
*/
import ConnectorBase from '../../connector.mjs'
import crypto from 'crypto'
export { ConnectorAuthentification_OAuth as Connector }

class ConnectorAuthentification_OAuth extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Authentification OAuth';
		this.token = 'authentification';
		this.className = 'ConnectorAuthentification_OAuth';
		this.group = 'awi';
		this.version = '0.6';
		this.activeSessions = new Map(); // Cache for active user sessions by userId
		this.tokenCache = new Map(); // Cache for token -> { userId, user, expires }
	}

	_getBearerFromParams(parameters) {
		const st = parameters && parameters.supabaseTokens;
		return st && (st.client_token || st.access_token) || null;
	}

	_purgeTokenCacheForUser(userId) {
		try {
			for (const [tok, val] of this.tokenCache.entries()) {
				if (val && val.userId === userId) this.tokenCache.delete(tok);
			}
		} catch {}
	}

	async connect()
	{
		// No need to load all accounts into memory anymore.
		// The database is the source of truth.
		return this.setConnected(true);
	}
  async validateToken(parameters)
  {
    const bearer = this._getBearerFromParams(parameters);
    if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
    const validation = await this._validateAndCacheToken(bearer);
    if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack } );
    const { userId, user } = validation;
    const configAnswer = await this.awi.configuration.loadConfigForUser(userId);
    if (configAnswer.isError() || !configAnswer.getValue())
      return this.newError({ message: 'awi:account-not-found', data: user.email }, { stack: new Error().stack });
    return this.newAnswer({ userId, user, config: configAnswer.getValue() });
  }
	async createAccount(parameters)
	{
		console.log('[AUTH-OAUTH] createAccount CALLED - email:', parameters.accountInfo?.email, 'awiName:', parameters.accountInfo?.awiName);
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) {
			console.log('[AUTH-OAUTH] createAccount - NO BEARER TOKEN');
			return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		}
		console.log('[AUTH-OAUTH] createAccount - validating token...');
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) {
			console.log('[AUTH-OAUTH] createAccount - TOKEN VALIDATION FAILED:', validation);
			return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		}
		const { userId, user } = validation;
		console.log('[AUTH-OAUTH] createAccount - token validated, userId:', userId, 'email:', user.email);

		// Log
		var text = 'Creating account:\n';
		text += '- Name: ' + parameters.accountInfo.awiName + '\n';
		text += '- Email: ' + user.email + '\n';
		text += '- First name: ' + parameters.accountInfo.firstName + '\n';
		text += '- Last name: ' + parameters.accountInfo.lastName + '\n';
		text += '- Country: ' + parameters.accountInfo.country + '\n';
		text += '- Language: ' + parameters.accountInfo.language + '\n';
		this.awi.editor.print( text, { user: 'awi', newLine: true, prompt: false, verbose: 4 } );

		// Create a new default user config and merge the provided info
		console.log('[AUTH-OAUTH] createAccount - creating config object...');
		const newConfig = this.awi.configuration.getNewUserConfig();
		newConfig.userId = userId;
		newConfig.userName = user.email;
		newConfig.awiName = parameters.accountInfo.awiName;
		newConfig.email = user.email;
		newConfig.firstName = parameters.accountInfo.firstName;
		newConfig.lastName = parameters.accountInfo.lastName;
		newConfig.fullName = `${parameters.accountInfo.firstName} ${parameters.accountInfo.lastName}`.trim();
		newConfig.country = parameters.accountInfo.country;
		newConfig.language = parameters.accountInfo.language;
		console.log('[AUTH-OAUTH] createAccount - config created, awiName:', newConfig.awiName, 'userId:', newConfig.userId);

		// Save the main AWI config to the database
		console.log('[AUTH-OAUTH] createAccount - calling updateUserConfig...');
		const configAnswer = await this.awi.database.updateUserConfig({ userId, config: newConfig, supabaseTokens: parameters.supabaseTokens });
		console.log('[AUTH-OAUTH] createAccount - updateUserConfig returned, isError:', configAnswer.isError(), 'value:', configAnswer.isError() ? configAnswer.error : 'SUCCESS');
		if (configAnswer.isError()) {
			console.log('[AUTH-OAUTH] createAccount - CONFIG SAVE FAILED:', JSON.stringify(configAnswer.error));
			return this.newError({ message: 'awi:account-not-found', data: user.email }, { stack: new Error().stack });
		}
		console.log('[AUTH-OAUTH] createAccount - config saved successfully');

		// Also update the public user_profiles table
		const profileData = {
			first_name: parameters.accountInfo.firstName,
			last_name: parameters.accountInfo.lastName,
			awi_name: parameters.accountInfo.awiName,
			user_name: user.email,
			full_name: newConfig.fullName,
			country: parameters.accountInfo.country,
			language: parameters.accountInfo.language
		};
		const profileAnswer = await this.awi.database.upsertUserProfile({ userId, profile: profileData, supabaseTokens: parameters.supabaseTokens });
		if (profileAnswer.isError()) 
			return this.newError({ message: 'awi:account-not-found', data: user.email }, { stack: new Error().stack });

		const code = (parameters.googleServerAuthCode || parameters.serverAuthCode || parameters.googleAuthCode || parameters.googleCode || (parameters.accountInfo && (parameters.accountInfo.googleServerAuthCode || parameters.accountInfo.serverAuthCode || parameters.accountInfo.googleAuthCode || parameters.accountInfo.googleCode))) || null;
		if (code)
		{
			const clientId = process.env[this.awi.projectPrefix + 'GOOGLE_CLIENT_ID'] || process.env.GOOGLE_CLIENT_ID || '';
			const clientSecret = process.env[this.awi.projectPrefix + 'GOOGLE_CLIENT_SECRET'] || process.env.GOOGLE_CLIENT_SECRET || '';
			if (clientId && clientSecret)
			{
				try
				{
					const body = new URLSearchParams({
						grant_type: 'authorization_code',
						code: code,
						client_id: clientId,
						client_secret: clientSecret,
						//redirect_uri intentionally omitted
					});
					const resp = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
					let respText = await resp.text();
					if (!respText) 
						return this.newError({ message: 'awi:error-when-exchanging-token', data: 'No response text' });
					if (resp && resp.ok)
					{
						let tok = JSON.parse(respText);
						await this.setGoogleTokens({ userId, tokens: {
							access_token: tok.access_token || '',
							refresh_token: tok.refresh_token || null,
							expires_in: tok.expires_in,
							scope: tok.scope || null,
							token_type: tok.token_type || 'bearer'
						}, supabaseTokens: parameters.supabaseTokens });
						/*
						// Schedule proactive refresh ~5 minutes before expiry
						const nextTime = Math.max(Date.now() + 60000, Number(expiresAt) - 5 * 60 * 1000);
						await this.awi.cron.command_createTask({
							connector_token: 'authentification:command_refreshGoogleToken',
							parameters: { userId, user },
							execution_time: nextTime,
							description: 'Google token auto-refresh for ' + user.email
						});
						*/
					}
				}
				catch(e){
					return this.newError({ message: 'awi:error-when-exchanging-token', data: e }, { stack: new Error().stack });
				}
			}
		}

		// Optional Supabase tokens from client
		try
		{
			const st = parameters.supabaseTokens;
			if (st)
			{
				const { client_token, access_token, refresh_token, expires_in, expires_at } = st;
				let expAt = (expires_at != null ? expires_at : (expires_in != null ? (Date.now() + Math.max(0, Number(expires_in) * 1000)) : null));
				await this.setSupabaseTokens({ userId, tokens: { access_token: access_token || '', refresh_token: refresh_token || null, expires_at: expAt || null } });
			}
		}
		catch {}
		return this.newAnswer({ userName: user.email });
	}
	/*
	async command_refreshGoogleToken(parameters, message, editor)
	{
		try
		{
			const userId = parameters && parameters.userId;
			if (!userId)
				return this.newError({ message: 'awi:invalid-parameters', data: 'missing: userId' });
			// Trigger refresh if needed
			const tok = await this.getGoogleAccessToken({ userId, minRemainingMs: 5 * 60 * 1000, user: parameters.user });
			if (tok && tok.isError && tok.isError())
				return tok;
			// Read latest expiry and schedule next refresh
			const row = await this.awi.database.getGoogleTokens({ userId, supabaseTokens: parameters.supabaseTokens });
			if (row && row.isError && row.isError())
				return row;
			const data = row ? row.data : null;
			if (!data || !data.expires_at)
				return this.newAnswer(true);
			const nextTime = Math.max(Date.now() + 60000, Number(data.expires_at) - 5 * 60 * 1000);
			await this.awi.cron.command_createTask({
				connector_token: 'authentification:command_refreshGoogleToken',
				parameters: { userId, user: parameters.user },
				execution_time: nextTime,
				description: 'Google token auto-refresh for ' + parameters.user.email
			});
			return this.newAnswer(true);
		}
		catch(e)
		{
			return this.newError({ message: 'awi:google-refresh-token-failed', data: e }, { stack: new Error().stack });
		}
	}
	*/
	async loginAccount(parameters)
	{
		console.log('[AUTH-OAUTH] loginAccount CALLED');
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) {
			console.log('[AUTH-OAUTH] loginAccount - NO BEARER TOKEN');
			return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		}
		console.log('[AUTH-OAUTH] loginAccount - validating token...');
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) {
			console.log('[AUTH-OAUTH] loginAccount - TOKEN VALIDATION FAILED:', validation);
			return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		}
		const { userId, user } = validation;	
		console.log('[AUTH-OAUTH] loginAccount - token validated, userId:', userId, 'email:', user.email);

		// Check if a user config exists in the database
		console.log('[AUTH-OAUTH] loginAccount - loading config for userId:', userId);
		const configAnswer = await this.awi.configuration.loadConfigForUser(userId);
		console.log('[AUTH-OAUTH] loginAccount - loadConfigForUser returned, isError:', configAnswer.isError(), 'hasValue:', !!configAnswer.getValue());

		if (configAnswer.isError() || !configAnswer.getValue())
			{
			console.log('[AUTH-OAUTH] loginAccount - NO CONFIG FOUND, error:', configAnswer.isError() ? JSON.stringify(configAnswer.error) : 'NO_VALUE');
			var text = 'Login account -> failed (' + user.email + ')\n';
			this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });

			// No config found, signal the client to create an account
			return this.newError({ message: 'awi:account-not-found', data: user.email }, { stack: new Error().stack });
		}
		console.log('[AUTH-OAUTH] loginAccount - config found, awiName:', configAnswer.getValue()?.awiName);

		const userConfig = configAnswer.getValue();

		// Create a session in the active cache
		this.activeSessions.set(userId, {
			userId: userId,
			userName: userConfig.email,
			loggedIn: true,
			loggedInAwi: false,
			key: crypto.randomBytes(64).toString('hex') // Session key
		});
		var text = 'Login account -> success (' + user.email + ', ' + userConfig.awiName + ')\n';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });

		try
		{
			const st = parameters.supabaseTokens;
			if (st)
			{
				const { client_token, access_token, refresh_token, expires_in, expires_at } = st;
				let expAt = (expires_at != null ? expires_at : (expires_in != null ? (Date.now() + Math.max(0, Number(expires_in) * 1000)) : null));
				await this.setSupabaseTokens({ userId, tokens: { access_token: access_token || '', refresh_token: refresh_token || null, expires_at: expAt || null } });
			}
		}
		catch {}

		return this.newAnswer({ userName: userConfig.awiName, key: this.activeSessions.get(userId).key });
	}
	async logoutAccount(parameters)
	{
		const bearer = this._getBearerFromParams(parameters);
		let validation = { success: false };
		if (bearer) validation = await this._validateAndCacheToken(bearer);
		// Even if invalid, proceed to clear any local session by provided userName if possible
		var text = 'Logout account -> success (' + parameters.userName + ')\n';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });

		if (validation.userId) {
			this.activeSessions.delete(validation.userId);
			this._purgeTokenCacheForUser(validation.userId);
		}

		// Ask Supabase to sign out
		await this.awi.database.command_signOut(parameters);

		return this.newAnswer({ userName: parameters.userName });
	}
	async getUserList( parameters )
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		var text = 'Get user list -> success (' + parameters.userName + ')\n';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });

		// Fetch all users from the database
		const profilesAnswer = await this.awi.database.getAllUserProfiles();
		if (profilesAnswer.isError()) 
			return profilesAnswer;
		const users = profilesAnswer.getValue() || [];
		return this.newAnswer({ users });
	}
	async loginAwi( awi, parameters )
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		const { userId } = validation;

		var error;
		const session = this.activeSessions.get(userId);
		if (!session || !session.loggedIn) {
			error = this.newError({ message: 'awi:account-not-logged-in', data: parameters.userName }, { stack: new Error().stack });
		}

		if (!error && session.loggedInAwi)
			error = this.newError({ message: 'awi:account-already-logged-in-awi', data: parameters.awiName }, { stack: new Error().stack });

		// Simple password check
		if (parameters.password != 'vsoftware' && parameters.password != 'VSoftware')
			error = this.newError({ message: 'awi:invalid-password', data: parameters.awiName }, { stack: new Error().stack });

		if (!error) {
			const answer = await awi.callConnectors(['setUser', '*', { userName: parameters.userName, awiName: parameters.awiName, userId: session.userId }], {}, {});
			if (answer.isError()) {
				error = this.newError({ message: 'awi:error-when-logging-in', data: parameters.awiName }, { stack: new Error().stack });
			}
		}
		if (error) {
			var text = 'Login Awi -> failed (' + parameters.awiName + ')';
			awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
			return error;
		}

		if (parameters.configs) {
			awi.configuration.setSubConfigs(parameters.configs);
		}

		session.loggedInAwi = true;
		var text = 'Login Awi -> success (' + parameters.awiName + ')';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
		return this.newAnswer({ userName: parameters.awiName });
	}
	async logoutAwi( awi, parameters )
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		const { userId } = validation;

		const session = this.activeSessions.get(userId);
		if (session && session.loggedInAwi) {
			session.loggedInAwi = false;
			await awi.callConnectors(['setUser', '*', { userName: '', awiName: '', userId: session.userId }], {}, {});
		}
		var text = 'Logout Awi -> success (' + parameters.awiName + ')';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
		return this.newAnswer({ userName: parameters.awiName });
	}
	async disconnect( awi, parameters )
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		const { userId } = validation;

		const session = this.activeSessions.get(userId);
		if (session && session.loggedInAwi) {
			session.loggedInAwi = false;
			await awi.callConnectors(['setUser', '*', { userName: '', awiName: '', userId: session.userId }], {}, {});
		}
		var text = 'Disconnected -> success (' + parameters.userName + ')';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
		return this.newAnswer({ userName: parameters.userName });
	}
	async deleteAccount(parameters)
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		const { userId } = validation;

		// Clear any local session and token cache
		this.activeSessions.delete(userId);
		this._purgeTokenCacheForUser(userId);

		// Delete user-related data in our database (best-effort; cannot delete auth.users with anon key)
		const delAnswer = await this.awi.database.deleteUser({ userId });
		if (delAnswer.isError()) 
			return delAnswer;
		var text = 'Delete account -> success (' + parameters.awiName + ')';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
		return this.newAnswer({ userName: parameters.awiName });
	}
	async getUserInfo(parameters)
	{
		const bearer = this._getBearerFromParams(parameters);
		if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
		const validation = await this._validateAndCacheToken(bearer);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
		const { userId } = validation;

		const session = this.activeSessions.get(userId);
		if (!session) {
			return this.newError({ message: 'awi:account-not-found', data: parameters.awiName });
		}
		var text = 'Get user info -> success (' + parameters.awiName + ')';
		this.awi.editor.print(text, { user: 'awi', newLine: true, prompt: false, verbose: 4 });
		// Return non-sensitive session info
		return this.newAnswer({ accountInfo: {
			userName: session.awiName,
			loggedIn: session.loggedIn,
			loggedInAwi: session.loggedInAwi
		} });
	}
	async validateAndCacheToken(token)
	{
		const validation = await this._validateAndCacheToken(token);
		if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation });
		const { userId } = validation;
		const session = this.activeSessions.get(userId);
		if (!session)
			return this.newError({ message: 'awi:account-not-found', data: userId });
		return this.newAnswer({ session: session, userId: userId, userName: session.userName });
	}
	// --- Helper Methods ---

	async _validateAndCacheToken(token) {
		if (!token) return { success: false };

		// Check cache first
		const cached = this.tokenCache.get(token);
		if (cached && cached.expires > Date.now()) {
			return { success: true, userId: cached.userId, user: cached.user };
		}

		// If not in cache or expired, validate with database
		const validationResult = await this.awi.database.validateToken(token);
		if (!validationResult || !validationResult.user) {
			this.tokenCache.delete(token);
			return { success: false };
		}

		const { user } = validationResult;
		const expires = Date.now() + (60 * 60 * 1000); // Cache for 1 hour
		this.tokenCache.set(token, { userId: user.id, user, expires });

		return { success: true, userId: user.id, user };
	}

	// Google OAuth tokens management
	async setGoogleTokens(parameters)
	{
		let userId = parameters && parameters.userId;
		if (!userId)
		{
			const bearer = this._getBearerFromParams(parameters);
			if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
			const validation = await this._validateAndCacheToken(bearer);
			if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
			userId = validation.userId;
		}
		const t = parameters.tokens || {};
		const access_token = t.access_token || parameters.access_token || parameters.gtoken || '';
		const refresh_token = t.refresh_token || parameters.refresh_token || null;
		let expires_at = t.expires_at || parameters.expires_at || null;
		const expires_in = (t.expires_in != null ? t.expires_in : parameters.expires_in);
		if (!expires_at && (expires_in != null))
			expires_at = Date.now() + Math.max(0, (Number(expires_in) || 3600) * 1000);
		const scope = t.scope || t.scopes || parameters.scope || null;
		const token_type = t.token_type || parameters.token_type || 'bearer';
		const ans = await this.awi.database.upsertGoogleTokens({ userId, tokens: {
			access_token,
			refresh_token,
			expires_at,
			scope,
			token_type
		}, supabaseTokens: parameters.supabaseTokens });
		if (ans.isError && ans.isError()) return ans;
		return this.newAnswer(true);
	}

	async getGoogleAccessToken(parameters = {})
	{
		let userId = parameters?.userId;
		if (!userId)
		{
			const bearer = this._getBearerFromParams(parameters);
			if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
			const validation = await this._validateAndCacheToken(bearer);
			if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
			userId = validation.userId;
		}

		const row = await this.awi.database.getGoogleTokens({ userId, supabaseTokens: parameters.supabaseTokens });
		if (row.isError && row.isError()) 
			return row;
		const data = row.data;
		if (!data || !data.access_token) 
			return this.newError({ message: 'awi:google-access-token-not-found' }, { stack: new Error().stack });
		// Normalize legacy records where expires_at was stored as a relative duration in ms
		if (data.expires_at != null && Number(data.expires_at) < 1e12) {
			const corrected = Date.now() + Number(data.expires_at);
			await this.awi.database.upsertGoogleTokens({ userId, tokens: {
				access_token: data.access_token,
				refresh_token: data.refresh_token || null,
				expires_at: corrected,
				scope: data.scope || null,
				token_type: data.token_type || 'bearer'
			}, supabaseTokens: parameters.supabaseTokens });
			data.expires_at = corrected;
		}
		const now = Date.now();
		const minRemainingMs = (parameters && Number(parameters.minRemainingMs) >= 0) ? Number(parameters.minRemainingMs) : 60000;
		if (!data.expires_at || now < Number(data.expires_at) - minRemainingMs)
			return this.newAnswer(data.access_token);
		if (!data.refresh_token) 
			return this.newError({ message: 'awi:refresh-token-not-found' }, { stack: new Error().stack });

		const clientId = process.env[this.awi.projectPrefix + 'GOOGLE_CLIENT_ID'] || process.env.GOOGLE_CLIENT_ID || '';
		const clientSecret = process.env[this.awi.projectPrefix + 'GOOGLE_CLIENT_SECRET'] || process.env.GOOGLE_CLIENT_SECRET || '';
		if (!clientId || !clientSecret)
			return this.newError({ message: 'awi:google-client-id-or-secret-not-found' }, { stack: new Error().stack });
		try
		{
			const url = 'https://oauth2.googleapis.com/token';
			const body = new URLSearchParams({
				grant_type: 'refresh_token',
				client_id: clientId,
				client_secret: clientSecret,
				refresh_token: data.refresh_token
			});
			const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
			if (!resp.ok)
				return this.newError({ message: 'awi:google-refresh-token-failed', data: body }, { stack: new Error().stack });
			const json = await resp.json();
			const newAccess = json.access_token || data.access_token;
			const newExpires = now + Math.max(0, (json.expires_in || 3600) * 1000);
			await this.awi.database.upsertGoogleTokens({ userId, tokens: {
				access_token: newAccess,
				refresh_token: json.refresh_token || data.refresh_token,
				expires_at: newExpires,
				scope: json.scope || data.scope,
				token_type: json.token_type || data.token_type || 'bearer'
			}, supabaseTokens: parameters.supabaseTokens });
			if (parameters.user)
				console.log('Refreshed Google token for ' + parameters.user.email);
			return this.newAnswer(newAccess);
		}
		catch
		{
			return this.newError({ message: 'awi:google-refresh-token-failed', data: parameters.user ? parameters.user.email : '' }, { stack: new Error().stack });
		}
	}

	async setSupabaseTokens(parameters)
	{
		let userId = parameters && parameters.userId;
		if (!userId)
		{
			const bearer = this._getBearerFromParams(parameters);
			if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
			const validation = await this._validateAndCacheToken(bearer);
			if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
			userId = validation.userId;
		}
		const t = parameters.tokens || {};
		const access_token = t.access_token || parameters.access_token || '';
		const refresh_token = t.refresh_token || parameters.refresh_token || null;
		let expires_at = t.expires_at || parameters.expires_at || null;
		const expires_in = (t.expires_in != null ? t.expires_in : parameters.expires_in);
		if (!expires_at && (expires_in != null))
			expires_at = Date.now() + Math.max(0, Number(expires_in) * 1000);
		const ans = await this.awi.database.updateNamedConfig({ userId, type: 'supabase_tokens', name: 'default', data: {
			access_token,
			refresh_token,
			expires_at
		}});
		if (ans.isError && ans.isError()) return ans;
		return this.newAnswer(true);
	}

	async getSupabaseAccessToken(parameters = {})
	{
		let userId = parameters?.userId;
		if (!userId)
		{
			const bearer = this._getBearerFromParams(parameters);
			if (!bearer) return this.newError({ message: 'awi:invalid-token', data: bearer }, { stack: new Error().stack });
			const validation = await this._validateAndCacheToken(bearer);
			if (!validation.success) return this.newError({ message: 'awi:invalid-token', data: validation }, { stack: new Error().stack });
			userId = validation.userId;
		}
		const row = await this.awi.database.getNamedConfig({ userId, type: 'supabase_tokens', name: 'default' });
		if (row.isError && row.isError())
			return row;
		let data = row.data;
		if (!data)
			return this.newError({ message: 'awi:supabase-access-token-not-found' }, { stack: new Error().stack });
		if (typeof data === 'string')
		{
			try { data = JSON.parse(data); } catch {}
		}
		if (!data || !data.access_token)
			return this.newError({ message: 'awi:supabase-access-token-not-found' }, { stack: new Error().stack });
		if (data.expires_at != null && Number(data.expires_at) < 1e12)
		{
			const corrected = Date.now() + Number(data.expires_at);
			await this.awi.database.updateNamedConfig({ userId, type: 'supabase_tokens', name: 'default', data: {
				access_token: data.access_token,
				refresh_token: data.refresh_token || null,
				expires_at: corrected
			}});
			data.expires_at = corrected;
		}
		const now = Date.now();
		const minRemainingMs = (parameters && Number(parameters.minRemainingMs) >= 0) ? Number(parameters.minRemainingMs) : 60000;
		if (!data.expires_at || now < Number(data.expires_at) - minRemainingMs)
			return this.newAnswer(data.access_token);
		if (!data.refresh_token)
			return this.newError({ message: 'awi:refresh-token-not-found' }, { stack: new Error().stack });
		const supaUrl = this.awi.database.url || '';
		const apiKey = this.awi.database.secretKey || '';
		if (!supaUrl)
			return this.newError({ message: 'awi:supabase-url-not-found' }, { stack: new Error().stack });
		if (!apiKey)
			return this.newError({ message: 'awi:supabase-api-key-not-found' }, { stack: new Error().stack });
		try
		{
			const url = `${supaUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`;
			const resp = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
				body: JSON.stringify({ refresh_token: data.refresh_token })
			});
			if (!resp.ok)
				return this.newError({ message: 'awi:supabase-refresh-token-failed', data: resp }, { stack: new Error().stack });
			const json = await resp.json();
			const newAccess = json.access_token || data.access_token;
			const newExpires = now + Math.max(0, (json.expires_in || 3600) * 1000);
			await this.awi.database.updateNamedConfig({ userId, type: 'supabase_tokens', name: 'default', data: {
				access_token: newAccess,
				refresh_token: json.refresh_token || data.refresh_token,
				expires_at: newExpires
			}});
			if (parameters.user)
				console.log('Refreshed Supabase token for ' + parameters.user.email);
			return this.newAnswer(newAccess);
		}
		catch
		{
			return this.newError({ message: 'awi:supabase-refresh-token-failed', data: parameters.user ? parameters.user.email : '' }, { stack: new Error().stack });
		}
	}
}
