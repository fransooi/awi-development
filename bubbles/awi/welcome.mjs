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
			control.editor.print( 'Database not connected.', { user: 'warning' } );
			
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
					control.editor.print( 'Please connect to http://localhost:8080 and proceed with configuration.', { user: 'awi' } );
					control.editor.print( 'Waiting for database connection...', { user: 'info' } );
					while ( !dbReady )
					{
						await new Promise( resolve => setTimeout( resolve, 1000 ) );
						if ( this.awi.database && this.awi.database.connected )
						{
							if ( this.awi.database.className !== 'ConnectorSupabase' || (this.awi.database.supabase && !this.awi.database.bootstrapFailed) )
							{
								dbReady = true;
								control.editor.print( 'Database connected!', { user: 'success' } );
							}
						}
					}

					// Wait for user profile creation in Web UI
					control.editor.print( 'Waiting for user profile creation...', { user: 'info' } );
					while ( true )
					{
						await new Promise( resolve => setTimeout( resolve, 1000 ) );
						await this.awi.configuration.loadConfigs();
						if ( this.awi.configuration.getUserList().length > 0 )
							break;
					}
					control.editor.print( 'Profile detected!', { user: 'success' } );
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
					control.editor.print( 'Database connected, but setup is incomplete (tables missing).', { user: 'warning' } );
					if (typeof this.awi.database.getBootstrapSQL === 'function') {
						control.editor.print( 'Please run the following SQL in your Supabase SQL Editor:', { user: 'awi' } );
						control.editor.print( this.awi.database.getBootstrapSQL(), { user: 'code' } );
					}
					// Return success so we don't crash, but user knows what to do.
					// In a real loop we might wait here too, but for now just exit welcome.
					return this.newAnswer( { success: false }, 'welcome:setup-required' );
				}
			}

			if ( !dbReady )
			{
				control.editor.print( 'Proceeding without database connection. Some features will be disabled.', { user: 'warning' } );
				return this.newAnswer( { success: true }, 'welcome:offline' );
			}
		}

		// 2. Check for User Profile
		// If users exist, we are good (or could ask to login, but for now just skip creation)
		const users = this.awi.configuration.getUserList();
		if ( users.length > 0 )
		{
			// Set as current user if not set
			if ( !this.awi.configuration.user )
			{
				const user = users[0];
				this.awi.configuration.user = user.userName;
				this.awi.configuration.userId = user.userId;
			}
			return this.newAnswer( 'Welcome back.', { level: 'debug' } );
		}

		// 3. Create New Profile
		control.editor.print( 'No user profile found. Let\'s create one.', { user: 'awi' } );
		
		const inputs = [
			{ name: 'firstName', description: 'your first name', type: 'string', optional: false },
			{ name: 'lastName', description: 'your last name', type: 'string', optional: false },
			{ name: 'userName', description: 'choose a user name', type: 'string', optional: false }
		];

		const answers = await this.awi.prompt.getParameters( { list: inputs, args: {} }, basket, control );
		if ( answers.isError() ) return answers;

		const data = answers.getValue();
		var config = this.awi.configuration.getNewUserConfig();
		config.firstName = data.firstName.result;
		config.lastName = data.lastName.result;
		config.fullName = config.firstName + ' ' + config.lastName;
		config.userName = data.userName.result;
		config.userId = crypto.randomUUID();
		
		await this.awi.configuration.setNewUserConfig( config.userName.toLowerCase(), config );
		
		// Set as active user
		this.awi.configuration.user = config.userName;
		this.awi.configuration.userId = config.userId;

		var answer = await this.awi.configuration.saveConfigs();
		
		if ( answer.isSuccess() )
		{
			return this.newAnswer( 'User profile created.', { level: 'debug', message: 'awi:config-changed' } );
		}
		
		control.editor.print( 'Failed to save configuration.', { user: 'error' } );
		return this.newError( { message: 'awi:config-save-failed' } );
	}
	async playback( args, basket, control )
	{
		return await super.playback( args, basket, control );
	}
}
