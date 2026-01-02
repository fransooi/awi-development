/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [     ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file supabase.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Supabase connector.
*
*/
import ConnectorDatabaseBase from './databasebase.mjs'
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
export { ConnectorSupabase as Connector }
class ConnectorSupabase extends ConnectorDatabaseBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'ConnectorSupabase';
		this.token = 'database';
		this.version = '0.5';
		this.supabase = null;
		this.url = config.url || '';
		this.secretKey = config.secretKey || '';
		this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
		this.admin = null;
		this._tokenInFlight = new Map();
		this._recentToken = new Map();
		this._resolvingTokens = new Set();
		this.bootstrapFailed = false;
	}

	getBootstrapSQL()
	{
		return `
			CREATE OR REPLACE FUNCTION exec_sql(query text) RETURNS void AS $$
			BEGIN
				IF current_setting('request.jwt.claims', true)::json->>'role' != 'service_role' THEN
					RAISE EXCEPTION 'exec_sql can only be called with service_role key';
				END IF;
				EXECUTE query;
			END;
			$$ LANGUAGE plpgsql SECURITY DEFINER;
		`;
	}

	async connect( options )
	{
		await super.connect( options );

		this.databasePrefix = options.databasePrefix || '';
		this.bootstrapFailed = false;
		
		// Resolve credentials: prefer options, then env vars with prefix, then defaults
		this.url = options.url || process.env[this.databasePrefix + 'SUPABASE_URL'] || this.url;
		this.secretKey = options.secretKey || process.env[this.databasePrefix + 'SUPABASE_SECRET_KEY'] || this.secretKey;
		this.serviceRoleKey = options.serviceRoleKey || process.env[this.databasePrefix + 'SUPABASE_SERVICE_ROLE_KEY'] || this.serviceRoleKey;

		if ( !this.url || !this.secretKey )
		{
			// Don't fail the entire server startup, just stay disconnected
			const msg = "\n⚠️  Supabase credentials missing. Database functionality will be disabled until configured.\n";
			try {
				if (this.awi.editor) await this.awi.editor.print(msg, { user: 'warning', verbose: 4 });
				else console.log(msg);
			} catch (e) {
				console.log(msg);
			}
			
			// We return success so the server keeps running to allow setup via wizard
			// We MUST call setConnected(true) otherwise Awi thinks initialization failed and exits.
			this.connectMessage = "Setup required";
			return this.setConnected(true);
		}
		try
		{
			this.supabase = createClient( this.url, this.secretKey );
			if (this.serviceRoleKey)
			{
				try { this.admin = createClient(this.url, this.serviceRoleKey); }
				catch { this.admin = null; }
			}
		}
		catch ( error )
		{
			if (this.awi && this.awi.log)
				this.awi.log('Supabase connect error: ' + (error && error.message ? error.message : String(error)), { functionName: 'connect', level: 'error', source: 'supabase' });
			return this.setConnected( false );
		}
		// Ensure all tables are there
		await this._ensureTables();
		await this._relaxConstraints();
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.command_signOut = this.command_signOut.bind(this);
		return this.newAnswer( info );
	}
	async validateToken( token )
	{
		try
		{
			if (!token || !this.supabase)
				return null;
			const { data: { user }, error } = await this.supabase.auth.getUser(token);
			if (error || !user)
				return null;
			return { user: user };
		}
		catch (error)
		{
			return null;
		}
	}

	async _getAccessToken(userId)
	{
		if (!userId) return null;
		// Reentrancy guard: avoid recursive loops while resolving the same user's token
		if (this._resolvingTokens.has(userId))
			return null;
		const recent = this._recentToken.get(userId);
		const now = Date.now();
		if (recent && (now - recent.t) < 500)
			return recent.v;
		let p = this._tokenInFlight.get(userId);
		if (!p)
		{
			p = (async () => {
				this._resolvingTokens.add(userId);
				const ans = await this.awi.authentification.getSupabaseAccessToken({ userId });
				if (ans && ans.isSuccess && ans.isSuccess()) return ans.data;
				return null;
			})();
			this._tokenInFlight.set(userId, p);
		}
		try
		{
			const tok = await p;
			this._recentToken.set(userId, { v: tok, t: now });
			return tok;
		}
		finally
		{
			this._tokenInFlight.delete(userId);
			this._resolvingTokens.delete(userId);
		}
	}

	async _getUserClientFrom({ userId, filters = [], record = null, bearer = null })
	{
		let uid = userId || null;
		if (!uid && Array.isArray(filters))
		{
			for (const f of filters)
			{
				const col = (f && String(f.column || ''));
				if (!uid && (col === 'user_id' || col === 'userId'))
					uid = f.value;
			}
		}
		if (!uid && record && typeof record === 'object')
		{
			if (record.user_id) uid = record.user_id;
			else if (record.userId) uid = record.userId;
		}
		// If a bearer is provided (e.g. coming from current request), use it directly
		if (bearer)
			return createClient(this.url, this.secretKey, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
		if (!uid)
			return this.supabase;
		const at = await this._getAccessToken(uid);
		if (!at)
			return this.supabase;
		return createClient(this.url, this.secretKey, { global: { headers: { Authorization: `Bearer ${at}` } } });
	}

	async command_signOut( parameters, message, editor )
	{
		const st = parameters?.supabaseTokens || {};
		const bearer = st.client_token || st.access_token || null;
		if (!await this.validateToken(bearer))
			return this.replyError( this.newError( { message: 'supabase:invalid-token', data: bearer }, { functionName: 'command_signOut' } ), message, editor );
		try
		{
			const { error } = await this.supabase.auth.signOut();
			if (!error)
				return this.replySuccess( this.newAnswer( {}, { functionName: 'command_signOut' } ), message, editor );
			return this.replyError( this.newError( { message: 'supabase:signout-error', data: error }, { functionName: 'command_signOut' } ), message, editor );
		}
		catch (error)
		{
			return this.replyError( this.newError( { message: 'supabase:signout-error', data: error }, { functionName: 'command_signOut' } ), message, editor );
		}
	}

	async getUserConfig({ userId }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'getUserConfig' });
		try
		{
			const client = await this._getUserClientFrom({ userId });
			const { data, error } = await client
				.from('awi_configs')
				.select('main_config')
				.eq('user_id', userId)
				.single();
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getUserConfig' } );
			return this.newAnswer(data ? data.main_config : null);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getUserConfig' } );
		}
	}

	async updateUserConfig({ userId, config, supabaseTokens = null }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'updateUserConfig' });
		try
		{
			// Use admin client (service role key) to bypass RLS since we're on the server side
			// creating configs on behalf of users during account creation
			const client = this.admin || this.supabase;
			const { data, error } = await client
				.from('awi_configs')
				.upsert({ user_id: userId, main_config: config, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
				.select();
			if (error) 
			{
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateUserConfig' } );
			}
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateUserConfig' } );
		}
	}

	async getNamedConfig({ userId, type, name }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'getNamedConfig' });
		try
		{
			const client = await this._getUserClientFrom({ userId });
			const { data, error } = await client
				.from('awi_named_configs')
				.select('config')
				.eq('user_id', userId)
				.eq('type', type)
				.eq('name', name)
				.single();
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getNamedConfig' } );
			return this.newAnswer(data ? data.config : null);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getNamedConfig' } );
		}
	}

	async updateNamedConfig({ userId, type, name, data }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'updateNamedConfig' });
		try
		{
			const client = this.admin || this.supabase;
			const { error } = await client
				.from('awi_named_configs')
				.upsert({ 
					user_id: userId, 
					type: type, 
					name: name, 
					config: data, 
					updated_at: new Date().toISOString() 
				}, { onConflict: 'user_id, type, name' })
				.select();
			if (error) 
			{
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateNamedConfig' } );
			}
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateNamedConfig' } );
		}
	}

	async getAllUserConfigs() 
	{
		try
		{
			// Use admin client if available to bypass RLS, otherwise fallback to standard client
			const client = this.admin || this.supabase;
			if (!client) return this.newAnswer([]);
			
			const { data, error } = await client
				.from('awi_configs')
				.select('user_id, main_config');
			if (error) {
				// PGRST205: relation does not exist. 42P01: Postgres table missing.
				// If table missing, just return empty list to avoid boot noise.
				if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.includes('PGRST205')))
					return this.newAnswer([]);
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getAllUserConfigs' } );
			}
			return this.newAnswer(data);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getAllUserConfigs' } );
		}
	}

	async getAllNamedConfigs() 
	{
		try
		{
			// Use admin client if available to bypass RLS
			const client = this.admin || this.supabase;
			if (!client) return this.newAnswer([]);

			const { data, error } = await client
				.from('awi_named_configs')
				.select('*');
			if (error) {
				// PGRST205: relation does not exist. 42P01: Postgres table missing.
				// If table missing, just return empty list to avoid boot noise.
				if (error.code === '42P01' || error.code === 'PGRST205' || (error.message && error.message.includes('PGRST205')))
					return this.newAnswer([]);
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getAllNamedConfigs' } );
			}
			return this.newAnswer(data);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'getAllNamedConfigs' } );
		}
	}

	// --- Generic Table Operations ---
	async queryRecords({ table, columns = '*', filters = [], orderBy = null, orderDirection = 'asc', limit = null, supabaseTokens = null }) 
	{
		if (!this.supabase) return this.newAnswer([]);
		try
		{
			let bearer = null;
			if (supabaseTokens)
				bearer = supabaseTokens.client_token || supabaseTokens.access_token || null;
			const client = await this._getUserClientFrom({ filters, bearer });
			let query = client.from(table).select(columns);
			for (const filter of filters)
				query = query.filter(filter.column, filter.operator, filter.value);
			if (orderBy)
				query = query.order(orderBy, { ascending: orderDirection === 'asc' });
			if (limit && typeof limit === 'number')
				query = query.limit(limit);

			const { data, error } = await query;
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'queryRecords' } );
			return this.newAnswer(data || []);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'queryRecords' } );
		}
	}

	async insertRecord({ table, record, supabaseTokens = null }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'insertRecord' });
		try 
		{
			let bearer = null;
			if (supabaseTokens)
				bearer = supabaseTokens.client_token || supabaseTokens.access_token || null;
			const client = await this._getUserClientFrom({ record, bearer });
			const { data, error } = await client
				.from(table)
				.insert(record)
				.select()
				.single();
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'insertRecord' } );
			return this.newAnswer(data);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'insertRecord' } );
		}
	}

	async updateRecord({ table, filters = [], update, supabaseTokens = null }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'updateRecord' });
		try 
		{
			let bearer = null;
			if (supabaseTokens)
				bearer = supabaseTokens.client_token || supabaseTokens.access_token || null;
			const client = await this._getUserClientFrom({ filters, bearer });
			let query = client.from(table).update(update);
			for (const filter of filters) 
				query = query.filter(filter.column, filter.operator, filter.value);
			const { data, error } = await query.select().single();
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateRecord' } );
			return this.newAnswer(data);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'updateRecord' } );
		}
	}

	async deleteRecord({ table, filters = [], supabaseTokens = null }) 
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'deleteRecord' });
		try 
		{
			let bearer = null;
			if (supabaseTokens)
				bearer = supabaseTokens.client_token || supabaseTokens.access_token || null;
			const client = await this._getUserClientFrom({ filters, bearer });
			let query = client.from(table).delete();
			for (const filter of filters) 
				query = query.filter(filter.column, filter.operator, filter.value);
			const { error } = await query;
			if (error) 
				return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'deleteRecord' } );
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:query-error', data: error }, { functionName: 'deleteRecord' } );
		}
	}

	async deleteUser({ userId }) 
	{
		if (!this.supabase) return this.newAnswer(true); // Nothing to delete
		let err = null;
		try
		{
			const client = await this._getUserClientFrom({ userId });
			({ error } = await client
				.from('awi_configs')
				.delete()
			.eq('user_id', userId));
			if (error) err = error;
			({ error } = await client
				.from('awi_named_configs')
				.delete()
			.eq('user_id', userId));
			if (error) err = error;
		}
		catch (error)
		{
			return this.newError( { message: 'supabase:delete-user-error', data: error }, { functionName: 'deleteUser' } );
		}
		if (err) 
			return this.newError( { message: 'supabase:query-error', data: err }, { functionName: 'deleteUser' } );
		return this.newAnswer(true);
	}

	async ensureTable({ table })
	{
		if (!this.supabase) return false;
		try
		{
			const { error } = await this.supabase
				.from(table)
				.select('id')
				.limit(1);
			if (error && !error.message.includes('permission'))
			{
				if (this.awi && this.awi.log)
					this.awi.log(`${table} table might not exist, please create it.`, { functionName: 'ensureTable', level: 'warning', source: 'supabase' });
				return false;
			}
		}
		catch (error)
		{
			if (this.awi && this.awi.log)
				this.awi.log('Error ensuring ' + table + ' table: ' + (error && error.message ? error.message : String(error)), { functionName: 'ensureTable', level: 'error', source: 'supabase' });
			return false;
		}
		return true;
	}

	// Check if a table exists - returns Answer with { exists: boolean }
	async tableExists({ table })
	{
		if (!this.supabase) return this.newAnswer({ exists: false });
		try
		{
			const { error } = await this.supabase
				.from(table)
				.select('*')
				.limit(1);
			// Table exists if no error, or error is just about permissions
			if (!error || error.message.includes('permission'))
				return this.newAnswer({ exists: true });
			// Error code 42P01 = undefined_table in PostgreSQL
			if (error.code === '42P01' || error.message.includes('does not exist'))
				return this.newAnswer({ exists: false });
			// Other errors - table might exist but we can't access it
			return this.newAnswer({ exists: false, error: error.message });
		}
		catch (error)
		{
			return this.newError({ message: 'supabase:table-exists-error', data: error }, { functionName: 'tableExists' });
		}
	}

	// Execute raw SQL using Supabase postgres connection (via pg REST or exec_sql RPC)
	async executeSQL({ sql })
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'executeSQL' });
		if (!this.serviceRoleKey)
			return this.newError({ message: 'supabase:no-service-role-key', data: 'Service role key required for SQL execution' }, { functionName: 'executeSQL' });
		
		// First try the exec_sql RPC function
		try
		{
			const response = await fetch(`${this.url}/rest/v1/rpc/exec_sql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'apikey': this.serviceRoleKey,
					'Authorization': `Bearer ${this.serviceRoleKey}`,
					'Prefer': 'return=minimal'
				},
				body: JSON.stringify({ query: sql })
			});
			if (response.ok || response.status === 204)
				return this.newAnswer({ success: true });
			
			const text = await response.text();
			
			// Debug logging to understand why bootstrap isn't triggering
			if (this.awi && this.awi.log && !response.ok) {
				this.awi.log(`Supabase SQL failed. Status: ${response.status}. Body: ${text.substring(0, 200)}`, { functionName: 'executeSQL', level: 'warning', source: 'supabase' });
			}

			// If exec_sql function doesn't exist, try to bootstrap it
			// Check for PostgreSQL error "undefined_function" or PostgREST error "PGRST202"
			if ((text.includes('function') && text.includes('does not exist')) || 
				text.includes('PGRST202') || 
				text.includes('Could not find the function'))
			{
				if (this.awi && this.awi.log)
					this.awi.log('exec_sql RPC not found, attempting to bootstrap...', { functionName: 'executeSQL', level: 'info', source: 'supabase' });
				const bootstrap = await this.bootstrapExecSQL();
				if (bootstrap.isError())
					return bootstrap;
				// Retry original SQL
				const retry = await fetch(`${this.url}/rest/v1/rpc/exec_sql`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'apikey': this.serviceRoleKey,
						'Authorization': `Bearer ${this.serviceRoleKey}`,
						'Prefer': 'return=minimal'
					},
					body: JSON.stringify({ query: sql })
				});
				if (retry.ok || retry.status === 204)
					return this.newAnswer({ success: true });
				return this.newError({ message: 'supabase:sql-error', data: await retry.text() }, { functionName: 'executeSQL' });
			}
			return this.newError({ message: 'supabase:sql-error', data: text }, { functionName: 'executeSQL' });
		}
		catch (error)
		{
			return this.newError({ message: 'supabase:sql-error', data: error }, { functionName: 'executeSQL' });
		}
	}

	// Bootstrap the exec_sql function using Supabase's pg_graphql or direct SQL endpoint
	async bootstrapExecSQL()
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'bootstrapExecSQL' });
		if (!this.serviceRoleKey)
			return this.newError({ message: 'supabase:no-service-role-key' }, { functionName: 'bootstrapExecSQL' });

		const execSqlFunction = this.getBootstrapSQL();

		try
		{
			// Try using Supabase's SQL endpoint (available on some plans)
			const response = await fetch(`${this.url}/pg/sql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'apikey': this.serviceRoleKey,
					'Authorization': `Bearer ${this.serviceRoleKey}`,
				},
				body: JSON.stringify({ query: execSqlFunction })
			});

			if (response.ok)
			{
				if (this.awi && this.awi.log)
					this.awi.log('exec_sql function created successfully via /pg/sql', { functionName: 'bootstrapExecSQL', level: 'info', source: 'supabase' });
				return this.newAnswer({ success: true });
			}

			// If /pg/sql not available, try pg_graphql
			const graphqlQuery = {
				query: `mutation { executeRawSQL(sql: ${JSON.stringify(execSqlFunction)}) }`
			};
			const gqlResponse = await fetch(`${this.url}/graphql/v1`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'apikey': this.serviceRoleKey,
					'Authorization': `Bearer ${this.serviceRoleKey}`,
				},
				body: JSON.stringify(graphqlQuery)
			});

			if (gqlResponse.ok)
			{
				const result = await gqlResponse.json();
				if (!result.errors)
				{
					if (this.awi && this.awi.log)
						this.awi.log('exec_sql function created successfully via GraphQL', { functionName: 'bootstrapExecSQL', level: 'info', source: 'supabase' });
					return this.newAnswer({ success: true });
				}
			}

			// Last resort: log manual instructions and set flag
			this.bootstrapFailed = true;
			if (this.awi && this.awi.log)
				this.awi.log('Could not auto-bootstrap exec_sql. Please run manually in Supabase SQL Editor:\n' + execSqlFunction, { functionName: 'bootstrapExecSQL', level: 'warning', source: 'supabase' });
			return this.newError({ message: 'supabase:bootstrap-failed', data: 'Manual setup required' }, { functionName: 'bootstrapExecSQL' });
		}
		catch (error)
		{
			return this.newError({ message: 'supabase:bootstrap-error', data: error }, { functionName: 'bootstrapExecSQL' });
		}
	}

	async _ensureTables()
	{
		// 1. awi_configs
		await this.ensureTableWithSQL({
			table: 'awi_configs',
			createSQL: `
				create table if not exists public.awi_configs (
					user_id uuid not null primary key references auth.users(id) on delete cascade,
					main_config jsonb,
					created_at timestamp with time zone default timezone('utc'::text, now()) not null,
					updated_at timestamp with time zone default timezone('utc'::text, now()) not null
				);
				alter table public.awi_configs enable row level security;
				create policy "Users can view own config" on public.awi_configs for select using (auth.uid() = user_id);
				create policy "Users can update own config" on public.awi_configs for update using (auth.uid() = user_id);
				create policy "Users can insert own config" on public.awi_configs for insert with check (auth.uid() = user_id);
				create policy "Users can delete own config" on public.awi_configs for delete using (auth.uid() = user_id);
			`
		});

		// 2. awi_named_configs
		await this.ensureTableWithSQL({
			table: 'awi_named_configs',
			createSQL: `
				create table if not exists public.awi_named_configs (
					id uuid default uuid_generate_v4() primary key,
					user_id uuid not null references auth.users(id) on delete cascade,
					type text not null,
					name text not null,
					config jsonb,
					created_at timestamp with time zone default timezone('utc'::text, now()) not null,
					updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
					unique(user_id, type, name)
				);
				alter table public.awi_named_configs enable row level security;
				create policy "Users can view own named configs" on public.awi_named_configs for select using (auth.uid() = user_id);
				create policy "Users can update own named configs" on public.awi_named_configs for update using (auth.uid() = user_id);
				create policy "Users can insert own named configs" on public.awi_named_configs for insert with check (auth.uid() = user_id);
				create policy "Users can delete own named configs" on public.awi_named_configs for delete using (auth.uid() = user_id);
			`
		});
	}

	async _relaxConstraints()
	{
		// Remove foreign key constraints to allow custom users (not just auth.users)
		// We do this to allow the simple "First Name / Last Name" flow without email/password
		await this.executeSQL({ sql: `
			DO $$ 
			BEGIN 
				IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'awi_configs_user_id_fkey') THEN 
					ALTER TABLE public.awi_configs DROP CONSTRAINT awi_configs_user_id_fkey; 
				END IF;
				IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'awi_named_configs_user_id_fkey') THEN 
					ALTER TABLE public.awi_named_configs DROP CONSTRAINT awi_named_configs_user_id_fkey; 
				END IF;
			END $$;
		` });
	}

	// Ensure table exists, create if not (requires service role + exec_sql RPC)
	async ensureTableWithSQL({ table, createSQL })
	{
		if (!this.supabase) return this.newError({ message: 'supabase:not-initialized', data: 'Supabase client not initialized' }, { functionName: 'ensureTableWithSQL' });
		const exists = await this.tableExists({ table });
		if (exists.isError())
			return exists;
		if (exists.data.exists)
		{
			if (this.awi && this.awi.log)
				this.awi.log(`Table ${table} already exists`, { functionName: 'ensureTableWithSQL', level: 'info', source: 'supabase' });
			return this.newAnswer({ created: false, exists: true });
		}
		// Table doesn't exist, try to create it
		if (this.awi && this.awi.log)
			this.awi.log(`Creating table ${table}...`, { functionName: 'ensureTableWithSQL', level: 'info', source: 'supabase' });
		const result = await this.executeSQL({ sql: createSQL });
		if (result.isError())
			return result;
		return this.newAnswer({ created: true, exists: true });
	}
}
