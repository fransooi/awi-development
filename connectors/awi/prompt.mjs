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
* @file prompt.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Handle a prompt in the current editor
*
*/
import ConnectorBase from '../../connector.mjs'
import Branch from '../../branch.mjs'
export { ConnectorPrompt as Connector }

class ConnectorPrompt extends ConnectorBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.name = 'Prompt';
		this.token = 'prompt';
		this.className = 'ConnectorPrompt';
		this.group = 'awi';
		this.version = '0.5';

		this.playing = false;
		this.viewing = false;
		this.lineActivated = false;
		this.promptOn = false;
		this.noCommand = false;
		this.waitingOn = false;
		this.waitingBubble = false;
		this.animationsOn = false;
		this.connected = false;
		this.datas = { };
		this.options = { awi: {}, bubble: {} };
		this.promptThis = this;
		this.questionCount = 1;
		this.promptOn = 0;
		this.basket = {};
		this.branch = new Branch( this.awi, { parent: 'prompt' } )
	}
	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async play( promtp, basket, control )
	{
		super.play( prompt, basket, control );
	}
	async playback( args, basket, control )
	{
		super.playback( args, basket, control );
	}
	async prompt( args, basket, control )
	{
		var { prompt, recursive } = this.awi.getArgs( [ 'prompt', 'recursive' ], args, basket, [ '', false ] );
		
		// Fix: Only get tokens from args, NEVER from basket (avoid stale tokens from recursion)
		// AND only if args is an object (to avoid re-consuming a string prompt as tokens)
		var tokens = null;
		if ( typeof args === 'object' && args !== null && !Array.isArray(args) )
		{
			var t = this.awi.getArgs( [ 'tokens' ], args, {}, [ null ] );
			tokens = t.tokens;
		}

		control.promptOn = ( typeof control.promptOn == 'undefined' ? 0 : control.promptOn );
		if ( control.promptOn && !recursive )
			return this.newError( { message: 'awi:busy' } );
		control.promptOn++;
		
		// Allow system commands to bypass login check
		const bypassCommands = ['setup', 'help', 'quit', 'exit'];
		const firstWord = prompt.split(' ')[0].toLowerCase().trim();
		const isBypass = bypassCommands.includes(firstWord) || prompt.trim().startsWith('awi.setup');
		
		if ( firstWord == 'quit' || firstWord == 'exit' )
		{
			prompt = 'awi.quit()';
		}

		if ( !isBypass && !this.awi.configuration.isUserLogged() )
		{
			var logged = false;

			// Is it the name of a user?
			var maybe = -1;
			for ( var start = 0; start < prompt.length; start++ )
			{
				if ( this.awi.utilities.getCharacterType( prompt.charAt( start ) ) == 'letter' )
				{
					maybe = start;
					break;
				}
			}
			if ( maybe >= 0 )
			{
				var userName = prompt.substring( maybe ).split( '\n' )[ 0 ].trim();
				if ( userName.toLowerCase() == 'newuser' )
				{
					logged = true;
					prompt = 'awi.welcome()';
				}
				else if ( this.awi.configuration.checkUserConfig( userName ) != null )
				{
					var answer = await this.awi.callConnectors( [ 'setUser', '*', { userName: prompt } ], basket, control );
					if ( answer.isSuccess() )
					{
						await this.awi.configuration.saveConfigs();
						control.editor.print( [
							'<BR>',
							'awi:user-changed:iwa',
							'------------------------------------------------------------------' ],
							{ user: 'information',
							userName: userName,
							newLine: true, prompt: false } );
						prompt = 'Hello Awi... Could you first say hello to the user ' + userName + ' then invent a funny joke about programming chores?';
						logged = true;
					}
					if ( !logged )
						control.editor.print( 'Cannot change user to ' + userName + '\n', { user: 'error' } );
				}
			}
			if ( !logged )
			{
				prompt = 'awi.welcome()';
				/*
				var list = this.awi.configuration.getUserList();
				if ( list.length == 0 )
				{
					prompt = 'awi.welcome()';
				}
				else
				{
					var sentList = [];
					control.editor.print( 'List of registered users on this machine...', { user: 'information' } );
					for ( var l = 0; l < list.length; l++ ){
						control.editor.print( '    ' + list[ l ].userName, { user: 'information' } );
						sentList.push( list[ l ].userName );
					}
					control.editor.print( 'Please enter the first name of a user, or "newuser"...', { user: 'information' } );
					control.editor.addDataToReply( 'userList', sentList );
					control.editor.addDataToReply( 'notLoggedIn', true );
					control.editor.waitForInput();
					control.promptOn--;
					return this.newAnswer();
				}
				*/
			}
		}

		// Handle empty prompt on startup (user logged in but no command yet)
		if ( !prompt )
		{
			var userConfig = this.awi.configuration.getUserConfig();
			var userName = userConfig ? userConfig.userName : 'User';
			control.editor.print( 'Welcome back, ' + userName + '. Ready for commands.', { user: 'awi' } );
			control.editor.waitForInput();
			control.promptOn--;
			return this.newAnswer();
		}

		var answer;
		if ( tokens )
		{
			answer = this.newAnswer( { tokens: tokens } );
		}
		else
		{
			answer = await this.awi.callConnectors( [ 'preparePrompt', '*', { prompt: prompt } ], basket, control );
		}

		if ( answer.isSuccess() )
		{
			this.branch.addTokens( { tokens: answer.data.tokens, list: 'up' }, basket, control );
			answer = await this.branch.runTokens( { list: 'up', from: 'last', args: {}, silent: true }, basket, control );
			if ( answer.isSuccess() )
			{
				answer = await this.awi.callConnectors( [ 'computeResponse', '*', { response: answer.getValue() } ], basket, control );
				if ( answer.isSuccess() )
				{
					var response = answer.data.response;
					if ( typeof response != 'string' )
						response = response ? String( response ) : '';
					if ( response )
						control.editor.print( response.split( '\n' ), { user: 'awi', newLine: true, prompt: false } );
				}
				else
				{
					// computeResponse failed
					var errorMsg = this.awi.messages && this.awi.messages.formatError ? 
						this.awi.messages.formatError( answer.error ) : 
						(answer.error ? answer.error.message : 'Unknown Error');
					control.editor.print( 'Response Error: ' + errorMsg, { user: 'error' } );
				}
			}
			else
			{
				// runTokens failed (e.g. bubble not found)
				var errorMsg = this.awi.messages && this.awi.messages.formatError ? 
					this.awi.messages.formatError( answer.error ) : 
					(answer.error ? answer.error.message : 'Unknown Error');
				control.editor.print( 'Execution Error: ' + errorMsg, { user: 'error' } );
			}
		}
		else
		{
			// Error in preparation (e.g. Parser failed)
			var errorMsg = this.awi.messages && this.awi.messages.formatError ? 
				this.awi.messages.formatError( answer.error ) : 
				(answer.error ? answer.error.message : 'Unknown Error');
				
			control.editor.print( 'Prompt Error: ' + errorMsg, { user: 'error' } );
		}
		
		if ( !recursive )
		{
			var userConfig = this.awi.configuration.getConfig('user');
			var name = userConfig && userConfig.awiName ? userConfig.awiName : this.awi.configuration.getUser();
			control.editor.setPrompt( '.(' + ( name ? name : 'user' ) + ') ? ' );
			control.editor.waitForInput( );
		}
		control.promptOn--;
		if ( !answer ) {
			control.editor.print( 'Prompt DEBUG: returning undefined answer! Creating default.', { user: 'error', verbose: 4 } );
			return this.newAnswer({ processed: true });
		}
		return answer;
	}
	async getParameters( argsIn, basket = {}, control = {} )
	{
		var { list, args } = this.awi.getArgs( [ 'list', 'args' ], argsIn, basket, [ [], {} ] );
		control.editor.saveInputs();
		var data = {};
		for ( var i = 0; i < list.length; i++ )
		{
			var newList = [ {
				type: 'bubble',
				group: 'awi',
				token: 'input',
				config: {},
				parameters: { inputInfo: [ { type: 'object', name: 'inputInfo', value: this.awi.utilities.convertPropertiesToParams( list[ i ] ) } ] }
			} ];
			var answer = await this.branch.initTokens( [ newList, {} ], basket, control );
			if ( answer.isSuccess() )
			{
				answer = await this.branch.runTokens( { tokens: newList, from: 'start', args: {} }, data, control );
				if ( answer.isSuccess() )
				{
					data[ list[ i ].name ] = answer.getValue();
				}
			}
		}
		control.editor.restoreInputs();
		return this.newAnswer( data );
	}
	escape( force )
	{
		if ( !force )
		{
			if ( this.working )
				return;
		}
		if ( this.chain.getLength() > 0 )
		{
			// Prevent re-interpretation of the last command
			var self = this;
			if ( this.handleNoCommand )
			{
				clearInterval( self.handleNoCommand );
				this.handleNoCommand = null;
			}
			this.noCommand = true;
			this.handleNoCommand = setTimeout( function()
			{
				self.noCommand = false;
				self.handleNoCommand = null;
			}, 500 );

			// Revert to checkpoint
			var bubble = this.chain.pop();
			if ( this.chain.length == 0 )
			{
				this.promptOn = false;
			}
		}
	}
	destroy()
	{
		this.destroyEventHandlers( this );
	}
};
