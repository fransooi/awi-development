/** --------------------------------------------------------------------------
*
*            / \
*          / _ \               (°°)       Intelligent
*        / ___ \ [ \ [ \  [ \ [   ]       Programmable
*     _/ /   \ \_\  \/\ \/ /  |  | \      Personal
* (_)|____| |____|\__/\__/  [_| |_] \     Assistant
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file bubble-welcome.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Welcome: displays welcome message, always called first. Can display nothing.
*        Can display animations, can depend on mood/news etc.
*/
import BubbleBase from '../../bubble.mjs'
import crypto from 'crypto'
export { BubbleWelcome as Bubble }

class BubbleWelcome extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Welcome',
			token: 'welcome',
			className: 'BubbleWelcome',
			group: 'awi',
			version: '0.5',
			action: 'ask for user first and last names and creates a new configuration',
			inputs: [],
			outputs: [ { userName: 'user name', type: 'string' },
				{ firstName: 'first name', type: 'string' },
				{ lastName: 'last name', type: 'string' }
			]
		} );
	}
	async play( args, basket, control )
	{
		await super.play( args, basket, control );

		// 1. Check Database Connection
		// Supabase connector might be "connected" but in "Setup required" state (supabase client is null)
		let dbReady = this.awi.database && this.awi.database.connected;
		if ( dbReady && this.awi.database.className === 'ConnectorSupabase' && !this.awi.database.supabase )
			dbReady = false;

		if ( !dbReady )
		{
			control.editor.print( 'Database not connected.', { user: 'warning', verbose: 4 } );
			
			const setup = await this.awi.prompt.getParameters( {
				list: [ { name: 'mode', description: 'Do you want to use the Web UI (U) or Terminal (t)?', type: 'string', optional: true } ],
				args: {} 
			}, basket, control );
			
			if ( setup.isSuccess() )
			{
				const val = setup.getValue();
				const ans = (val && val.mode && val.mode.result) ? val.mode.result.toLowerCase() : 'u';
				
				if ( ans === 't' || ans === 'terminal' )
				{
					// Run setup bubble
					const setupBubble = this.awi.bubbles['setup'];
					if (setupBubble)
						return await setupBubble.play( {}, basket, control );
				}
				else
				{
					control.editor.print( 'Please connect to http://localhost:8080 and proceed with configuration.', { user: 'awi', verbose: 4 } );
					control.editor.print( 'Waiting for database connection...', { user: 'info', verbose: 4 } );
					while ( !dbReady )
					{
						await new Promise( resolve => setTimeout( resolve, 1000 ) );
						if ( this.awi.database && this.awi.database.connected )
						{
							if ( this.awi.database.className !== 'ConnectorSupabase' || (this.awi.database.supabase && !this.awi.database.bootstrapFailed) )
							{
								dbReady = true;
								control.editor.print( 'Database connected!', { user: 'success', verbose: 4 } );
							}
						}
					}

					// Wait for user profile creation in Web UI
					control.editor.print( 'Waiting for user profile creation...', { user: 'info', verbose: 4 } );
					while ( true )
					{
						await new Promise( resolve => setTimeout( resolve, 1000 ) );
						await this.awi.configuration.loadConfigs();
						if ( this.awi.configuration.getUserList().length > 0 )
							break;
					}
					control.editor.print( 'Profile detected!', { user: 'success', verbose: 4 } );
				}
			}
			// If we are here, user declined setup or setup finished/failed.
			// Re-check connection
			dbReady = this.awi.database && this.awi.database.connected;
			if ( dbReady && this.awi.database.className === 'ConnectorSupabase' )
			{
				if (!this.awi.database.supabase) dbReady = false;
				else if (this.awi.database.bootstrapFailed)
				{
					control.editor.print( 'Database connected, but setup is incomplete (tables missing).', { user: 'warning', verbose: 4 } );
					if (typeof this.awi.database.getBootstrapSQL === 'function') {
						control.editor.print( 'Please run the following SQL in your Supabase SQL Editor:', { user: 'awi', verbose: 4 } );
						control.editor.print( this.awi.database.getBootstrapSQL(), { user: 'code', verbose: 4 } );
					}
					// Return success so we don't crash, but user knows what to do.
					// In a real loop we might wait here too, but for now just exit welcome.
					return this.newAnswer( { success: false }, 'welcome:setup-required' );
				}
			}

			if ( !dbReady )
			{
				control.editor.print( 'Proceeding without database connection. Some features will be disabled.', { user: 'warning', verbose: 4 } );
				return this.newAnswer( { success: true }, 'welcome:offline' );
			}
		}

		// 2. Interactive Login / Onboarding Flow
		while ( !this.awi.configuration.isUserLogged() )
		{
			// Prompt for username
			const loginPrompt = await this.awi.prompt.getParameters( {
				list: [ { name: 'username', description: "your user name (or 'newuser' to create one)", type: 'string', optional: false } ],
				args: {} 
			}, basket, control );

			if ( loginPrompt.isError() ) return loginPrompt;
			
			const values = loginPrompt.getValue();
			if ( !values || !values.username )
			{
				// Input might be interrupted or a command was executed
				control.editor.print( 'Invalid input, please try again.', { user: 'warning', verbose: 4 } );
				continue;
			}
			
			const usernameInput = (values.username.result ? values.username.result : values.username).trim();
			const lowerInput = usernameInput.toLowerCase();

			if ( lowerInput === 'newuser' )
			{
				// --- Onboarding Flow ---
				control.editor.print( 'Starting onboarding procedure...', { user: 'awi', verbose: 4 } );
				
				const onboarding = await this.awi.prompt.getParameters( {
					list: [
						{ name: 'userName', description: 'your user name (e.g. francois)', type: 'string', optional: false },
						{ name: 'email', description: 'your email address', type: 'string', optional: false },
						{ name: 'country', description: 'your country (fr, france...)', type: 'string', optional: false },
						{ name: 'language', description: 'your preferred language (en, fr...)', type: 'string', optional: false }
					],
					args: {}
				}, basket, control );

				if ( onboarding.isError() ) return onboarding;
				const data = onboarding.getValue();
				
				// Create Config
				var config = this.awi.configuration.getNewUserConfig();
				config.userName = (data.userName.result ? data.userName.result : data.userName);
				config.firstName = config.userName; // Defaulting firstName to userName for now
				config.email = (data.email.result ? data.email.result : data.email);
				config.country = (data.country.result ? data.country.result : data.country);
				config.language = (data.language.result ? data.language.result : data.language);
				config.awiName = config.userName;
				config.userId = crypto.randomUUID();
				config.persona = 'awi'; // Default persona

				// Save
				await this.awi.configuration.setNewUserConfig( config.userName.toLowerCase(), config );
				
				// Login
				this.awi.configuration.user = config.userName;
				this.awi.configuration.userId = config.userId;
				
				var saved = await this.awi.configuration.saveConfigs();
				if ( saved.isSuccess() )
				{
					this.awi.log('User profile created!', { level: 'success' });
					if ( this.awi.persona )
						await this.awi.persona.setUser( { userName: config.userName }, basket, control );
					break; 
				}
				else
				{
					this.awi.log('Failed to save configuration: ' + saved.getPrint(), { level: 'error' });
					return this.newError( { message: 'awi:config-save-failed' }, { stack: new Error().stack } );
				}
			}
			else
			{
				// --- Login Flow ---
				const userConfig = this.awi.configuration.checkUserConfig( lowerInput );
				
				if ( userConfig )
				{
					// Ask for password (dummy check for now)
					const passPrompt = await this.awi.prompt.getParameters( {
						list: [ { name: 'password', description: "Enter password (leave blank)", type: 'string', optional: true } ],
						args: {} 
					}, basket, control );
					
					this.awi.log('Password received, logging in...', { level: 'debug' });

					// We accept everything for now as requested
					
					// Perform Login
					await this.awi.configuration.setUser( { userName: lowerInput }, basket, control );
					
					this.awi.log('User set, loading persona...', { level: 'debug' });

					// Ensure persona is loaded
					if ( this.awi.persona )
						await this.awi.persona.setUser( { userName: lowerInput }, basket, control );

					this.awi.log('Persona loaded.', { level: 'debug' });

					break; // Logged in
				}
				else
				{
					this.awi.log("User '" + usernameInput + "' not found.", { level: 'error' });
					// Loop continues
				}
			}
		}

		var personaName = 'Awi';
		if ( this.awi.persona && this.awi.persona.persona && this.awi.persona.persona.name )
			personaName = this.awi.persona.persona.name;

		control.editor.print( 'Welcome back, I am ' + personaName + ', how can I help?', { user: 'awi', verbose: 4 } );
		return this.newAnswer( { success: true } );
	}
	async playback( args, basket, control )
	{
		return await super.playback( args, basket, control );
	}
}
