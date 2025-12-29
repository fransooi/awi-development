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
* @file ed-websocket.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Web-Socket based editor
*
*/
import EdNetwork from './ed-network.mjs';
import { SERVERCOMMANDS } from '../../servercommands.mjs';
export { EdWebSocket as Ed }
class EdWebSocket extends EdNetwork
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'EdWebSocket';
		this.connection = config.connection;
		this.lastMessage = config.lastMessage;
		this.handle = this.awi.utilities.getUniqueIdentifier( {}, 'websocket' );
	}
	async connect(options, message)
	{
		this.welcomePrompt = '';
		if ( message && message.parameters && message.parameters.config && message.parameters.config.prompt)
			this.welcomePrompt = message.parameters.config.prompt;
		return await super.connect( options, message );
	}
	reply( parameters, lastMessage = null )
	{
		var message = {
			handle: lastMessage ? lastMessage.handle : this.lastMessage.handle,
			responseTo: lastMessage ? lastMessage.command : this.lastMessage.command,
			callbackId: lastMessage ? lastMessage.id : this.lastMessage.id,
			id: this.awi.utilities.getUniqueIdentifier( {}, 'message' ),
			parameters: parameters
		};
		var userName = 'unknown';
		if ( lastMessage && lastMessage.parameters && lastMessage.parameters.userName )
			userName = lastMessage.parameters.userName;
		var text = 'REPLY  : "' + message.responseTo + '" to user: ' + userName;
		var params = '';
		for ( var key in parameters )
		{
			try
			{
				params += '.        ' + key + ': ' + parameters[ key ].toString().substring( 0, 60 ) + ', \n';
			}
			catch (e)
			{
			}
		}
		if ( params )
			text += '\n' + params;
		this.awi.awi.editor.print( text, { user: 'awi' } );
		this.connection.send( JSON.stringify( message ) );
	}
	replyError( error, message )
	{
		if ( message )
		{
			var parameters = { error: error.getPrint() };
			if ( error && error.parent && error.parent.debug && error.extraData )
				parameters.extraData = error.extraData;
			this.reply( parameters, message );
		}
		return error;
	}
	replySuccess( answer, message )
	{
		if ( message )
		{
			var parameters = answer.data;
			if ( answer && answer.parent && answer.parent.debug && answer.extraData )
			{
				if ( parameters && typeof parameters == 'object' && !Array.isArray( parameters ) )
					parameters = { ...parameters, extraData: answer.extraData };
				else
					parameters = { data: parameters, extraData: answer.extraData };
			}
			this.reply( parameters, message );
		}
		return answer;
	}
	close()
	{
		this.command_disconnect();
	}
	setUser(args, basket = {}, control = {})
	{
		var { userName, awiName } = this.awi.getArgs( [ 'userName', 'awiName' ], args, basket, [ '', '' ] );
		this.userName = userName;
		this.awiName = awiName;
		return this.newAnswer( true );
	}
	sendMessage( command, parameters, callback )
	{
		var message = {
			handle: this.handle,
			command: command,
			parameters: parameters,
			id: this.awi.utilities.getUniqueIdentifier( {}, 'message' )
		};
		if ( callback )
		{
			message.callbackId = this.awi.utilities.getUniqueIdentifier( this.callbacks, 'awi' );
			this.callbacks[ message.callbackId ] = callback;
		}
		var text = 'MESSAGE: "' + command + '" to user: ' + this.userName;
		var params = '';
		for ( var key in parameters )
		{
			try
			{
				params += '.        ' + key + ': ' + parameters[ key ].toString().substring( 0, 60 ) + ', \n';
			}
			catch (e)
			{
			}
		}
		if ( params )
			text += '\n' + params;
		this.awi.awi.editor.print( text, { user: 'awi' } );
		this.connection.send( JSON.stringify( message ) );
	}
	async onMessage( message )
	{
		this.lastMessage = message;
		if ( message.callbackId )
		{
			var callback = this.callbacks[ message.callbackId ];
			if ( callback )
			{
				this.callbacks[ message.callbackId ] = undefined;
				callback( message );
				return;
			}
		}
		var errorParameters = { error: 'awi:socket-command-not-found' };
		try
		{
			var lastSession = await this.awi.authentification.validateAndCacheToken(message.parameters.token);
			if ( lastSession.isError() )
				return this.replyError( lastSession, message );
			this.lastSession = lastSession.data;
			this.lastSession.token = message.parameters.token;
			message.parameters.session = this.lastSession.session;
			message.parameters.userId = this.lastSession.userId;
			message.parameters.userName = this.lastSession.userName;

			var text = 'COMMAND: "' + message.command + '" from user: ' + message.parameters.userName;
			var parameters = '';
			for ( var key in message.parameters )
			{
				try
				{
					parameters += '.        ' + key + ': ' + message.parameters[ key ].toString().substring( 0, 60 ) + ', \n';
				}
				catch (e)
				{
				}
			}
			if ( parameters )
				text += '\n' + parameters;
			if ( this[ 'command_' + message.command ] )
			{
				this.awi.awi.editor.print( text, { user: 'awi' } );
				return this[ 'command_' + message.command ]( message.parameters, message );
			}
			else
			{
				this.awi.awi.editor.print( text, { user: 'awi' } );
				var column = message.command.indexOf( ':' );
				if ( column > 0 )
				{
					var connector = message.command.substring( 0, column );
					if ( this.connectors[ connector ] )
					{
						var command = message.command.substring( column + 1 );
						if ( this.connectors[ connector ].commands[ command ] )
							return this.connectors[ connector ].commands[ command ]( message.parameters, message, this );
						return this.replyError( this.newError( { message: 'awi:command-not-found', data: parameters.command }, { functionName: 'onMessage' } ), message );
					}
				}
			}
			return this.replyError( this.newError( { message: 'awi:connector-not-found', data: parameters.command }, { functionName: 'onMessage' } ), message );
		}
		catch( e )
		{
			errorParameters.error = 'awi:socket-error-processing-command';
			errorParameters.catchedError = e;
		}
		var text = this.awi.messages.getMessage( errorParameters.error, { command: message.command } );
		this.awi.awi.editor.print( text, { user: 'awi' } );
		this.reply( errorParameters );
	}
	waitForInput( options = {} )
	{
		super.waitForInput( options );
		if (this.toPrint.length > 0 || !this.awi.utilities.isObjectEmpty(this.toReply))
		{
			var message = {
				text: this.toPrint.join(''),
				textClean: this.toPrintClean.join('\n'),
				lastLine: this.lastLine
			};
			if ( this.toReply )
				for( var p in this.toReply )
					message[ p ] = this.toReply[ p ];
			this.sendMessage( SERVERCOMMANDS.PROMPT, message );
			this.toPrint = [];
			this.toPrintClean = [];
			this.toReply = {};
		}
	}
	async command_loginAccount( parameters, message )
	{
		var answer = await this.awi.authentification.loginAccount( { userName: parameters.accountInfo.userName, password: parameters.password } );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_logoutAccount( parameters, message )
	{
		var answer = await this.awi.authentification.logoutAccount( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_createAwiAccount( parameters, message )
	{
		var answer = await this.awi.authentification.createAwiAccount( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_disconnect()
	{
		if ( this.lastSession )
		{
			await this.awi.authentification.disconnect( this.awi,
			{
				token: this.lastSession.token,
				userId: this.lastSession.userId,
				userName: this.lastSession.userName,
				awiName: this.lastSession.awiName
			} );
			this.lastSession = null;
		}
	}
	async command_loginAwi( parameters, message )
	{
		var answer = await this.awi.authentification.loginAwi( this.awi, parameters );
		if ( answer.isError() )
			return this.replyError( answer, message );
		this.waitForInput();
		if ( this.welcomePrompt )
		{
			await this.awi.prompt.prompt({ prompt: this.welcomePrompt }, {}, { editor: this } );
			this.welcomePrompt = '';
		}
		return this.replySuccess( answer, message );
	}
	async command_logoutAwi( parameters, message )
	{
		var answer = await this.awi.authentification.logoutAwi( this.awi, parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_deleteAccount( parameters, message )
	{
		var answer = await this.awi.authentification.deleteAccount( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_getUserInfo( parameters, message )
	{
		var answer = await this.awi.authentification.getUserInfo( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
	async command_getUserList( parameters, message )
	{
		var answer = await this.awi.authentification.getUserList( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
}
