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
* @file ed-network.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Root class of Editors
*
*/
import EdBase from './ed-base.mjs';
export default class EdNetwork extends EdBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.version = '0.5';
		this.className = 'EdNetwork';

		this.templatesUrl = config.templatesUrl;
		this.projectsUrl = config.projectsUrl;
		this.runUrl = config.runUrl;
		this.accounts = {};
		this.languageMode = '';
		this.connectors = null;
		this.lastMode = '';
	}
	async connect(options, message)
	{
		super.connect( options );

		var userName = options.userName;
		var answer = await this.awi.callConnectors( [ 'registerEditor', '*', { token: this.token, editor: this, userName: userName } ] );
		if ( !answer.isSuccess() )
			return this.replyError( answer, message );
		this.connectors = answer.data;
		return true;
	}
	async addDataToReply( name, data )
	{
		this.toReply[ name ] = data;
	}
	waitForInput( options = {} )
	{
		super.waitForInput( options );
	}
	print( text, options = {} )
	{
		return super.print( text, options );
	}
	setUser(args, basket = {}, control = {})
	{
		return this.newAnswer( true );
	}

	// AWI commands
	async command_prompt( parameters, message )
	{
		var answer;

		this.promptMessage = message;
		var basket = this.awi.configuration.getBasket( 'user' );
		if ( this.inputEnabled )
		{
			if ( this.reroute )
				answer = await this.reroute( { prompt: parameters.prompt }, basket, { editor: this } );
			else
				answer = await this.awi.prompt.prompt( { prompt: parameters.prompt }, basket, { editor: this } );
			this.awi.configuration.setBasket( 'user', answer.getValue() );
		}
		else
		{
			this.toAsk.push( { parameters, message } );
			if ( !this.handleAsk )
			{
				var self = this;
				this.handleAsk = setInterval(
					function()
					{
						if ( self.inputEnabled && self.toAsk.length > 0 )
						{
							var params = self.toAsk.pop();
							self.command_prompt( { prompt: params.parameters }, params.message );
						}
						if ( self.toAsk.length == 0 )
						{
							clearInterval( self.handleAsk );
							self.handleAsk = null;
						}
					}, 100 );
			}
		}
	}
}
