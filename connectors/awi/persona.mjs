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
* @file persona.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Handle various personalities / create adapted prompts
*
*/
import ConnectorBase from '../../connector.mjs'
export { ConnectorPersona as Connector }

export default class ConnectorPersona extends ConnectorBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.name = 'Persona';
		this.token = 'persona';
		this.className = 'ConnectorPersona';
		this.group = 'awi';
		this.version = '0.5';

		this.persona = '';
		this.personaToken = '';
	}
	connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async loadPersonaFromFile( token )
	{
		var path = this.awi.configuration.getDataPath() + '/personalities/' + token + '.hjson';
		var answer = await this.awi.files.loadHJSON( path );
		if ( answer.isSuccess() )
			return answer.getValue();
		return null;
	}
	async setPersona( args, basket, control )
	{
		var { token } = this.awi.getArgs( 'token', args, basket, [ '' ] );
		var persona;
		if ( token != this.personaToken || !this.persona )
		{
			persona = this.awi.configuration.getPersona( token );
			if ( !persona || !persona.name )
			{
				persona = await this.loadPersonaFromFile( token );
				if ( persona )
				{
					this.awi.configuration.setPersona( token, persona );
				}
				else
				{
					if ( token != 'awi' )
						return await this.setPersona( { token: 'awi' }, basket, control );
					return this.newError( { message: 'awi:persona-not-found', data: token } );
				}
			}
			this.personaToken = token;
			this.persona = persona;
		}
		return this.newAnswer( persona );
	}

	// Exposed functions
	async setUser( args, basket, control )
	{
		var { userName, awiName } = this.awi.getArgs( [ 'userName', 'awiName' ], args, basket, [ '', '' ] );
		if ( !userName )
		{
			this.persona = null;
			return this.newAnswer( true );
		}
		var config = this.awi.configuration.getConfig( userName );
		if ( !config )
			return this.newError( { message: 'user-not-found', data: userName } );
		var token = config.persona || 'awi';
		return this.setPersona( { token: token } );
	}
	async preparePrompt( args, basket, control )
	{
		var { prompt } = this.awi.getArgs( [ 'prompt' ], args, basket, [ '' ] );
		return this.newAnswer( { prompt: prompt } );
	}
	async computeResponse( args, basket, control )
	{
		var { response } = this.awi.getArgs( [ 'response' ], args, basket, [ '' ] );
		return this.newAnswer( { response: response } );
	}
	async saveMemories( args, basket, control )
	{
		return this.newAnswer( true );
	}
}
