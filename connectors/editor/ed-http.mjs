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
* @file ed-http.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short HTTP based editor 
*
*/
import EdNetwork from './ed-network.mjs';
export { EdHttp as Ed }
class EdHttp extends EdNetwork
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'EdHttp';
		this.token = 'edhttp';
		this.handle = 'http';
	}
	async connect(options, message)
	{
		return super.connect( options, message );
	}
	
	reply( parameters, lastMessage = null )
	{
		var message = {
			id: this.awi.utilities.getUniqueIdentifier( {}, 'message' ),
			responseTo: lastMessage ? lastMessage.command : this.lastMessage.command,
			parameters: parameters
		};
		var userName = 'unknown';
		if ( lastMessage && lastMessage.parameters )
			userName = lastMessage.parameters.userName;
		var text = 'REPLY  : "' + message.responseTo + '" to user: ' + userName;
		var params = '';
    /*
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
    */
		//this.awi.editor.print( text, { user: 'awi' } );
		return message;
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
	async onMessage( message )
	{
		this.lastMessage = message;
		var errorParameters = { error: 'awi:rest-command-not-found' };
		try
		{
			const st = message.parameters?.supabaseTokens || {};
			const bearer = st.client_token || st.access_token || null;
			var session = await this.awi.authentification.validateAndCacheToken(bearer);
			if ( session.isError() ) return this.replyError(session, message);
			message.parameters.session = session.data.session;
			message.parameters.userId = session.data.userId;
			message.parameters.userName = session.data.userName;
			// Don't overwrite awiName if it's already provided (e.g., during account creation)
			if (!message.parameters.awiName && !message.parameters.accountInfo?.awiName) {
				message.parameters.awiName = session.data.awiName || session.data.userName;
			}

      //////////////////////////////////////////////////////////////////////////
      // TODO: remove this in production
      // Skip whitelist check during account creation (command contains 'createAccount')
      const isAccountCreation = message.command && ( message.command.includes('createAccount') || message.command.includes('registerDevice') );
      if (!isAccountCreation && message.parameters.awiName != 'francois' && message.parameters.awiName != 'richard')
        return this.replyError(this.newError({ message: 'awi:user-not-allowed', data: session.data.awiName }, { functionName: 'onMessage' }), message);
      //////////////////////////////////////////////////////////////////////////

			var answer = await this.dispatchMessage( message );
			if ( answer.isError() )
				return this.replyError( answer, message );
			return answer;
		}
		catch( e )
		{
			errorParameters.error = 'awi:rest-error-processing-command';
			errorParameters.catchedError = e;
		}
		var text = this.awi.messages.getMessage( errorParameters.error, { command: message.command } );
		this.awi.editor.print( text, { user: 'awi' } );
		return this.reply( errorParameters );
	}
	sendMessage( command, parameters, callback )
	{
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
	async user_connect( parameters, message )
	{
		var answer = await this.awi.authentification.connect( parameters );
		if ( answer.isSuccess() )
			return this.replySuccess( answer, message );
		return this.replyError( answer, message );
	}
}
