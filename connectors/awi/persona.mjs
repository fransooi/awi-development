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
		this.personaDefault = {
			name: 'Think',
			character: 'think',
			animations: false,
			system: {
				start: [],
				middle: [],
				end: []
			},
			assistant: {},
			user: {},
			temperature: 0.1,
			prompts:
			{
				user: '',
				awi: '.(°°) ',
				result: '.(..) ',
				information: '.(oo) ',
				question: '?(°°) ',
				command: '>(°°)',
				root: '.[oo] ',
				warning: '.(OO) ',
				error: '.(**) ',
				code: '.{..} ',
				debug1: '.[??] ',
				debug2: '.[??] ',
				debug3: '.[??] ',
				verbose1: '.(oo) ',
				verbose2: '.(oo) ',
				verbose3: '.[oo] ',
			}
		};
		this.defaultPersonalities = {
			think: {
				name: 'Think',
				token: 'think',
				temperature: 0.1,
				system: {
					start: [
						'The goal of this conversation is to help the authors of this application to create it.',
					],
				},
				assistant: {
					start: [
						'Your name is Think. You are a good assistant that knows a lot about technology and computers.',
						'You are a smart assistant, specialized in software developement and AI.',
						'You are are currently in the middle of the developement of a new AI-driven phone application, named "Think Notes".',
						'This application is developped in Expo React Native for the phone version, Vite.js for web, node.js for server.',
						'You are here to help the authors of this application to create it, Richard Vanner is the project manager, Francois Lionet is the programmer.',
					],
				},
				user: {
					start: [],
				},
			},
		}
	}
	connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	setPersona( args, basket, control )
	{
		var { token } = this.awi.getArgs( 'token', args, basket, [ '' ] );
		var persona;
		if ( token != this.personaToken )
		{
			persona = this.awi.configuration.getPersona( 'user' );
			if ( persona )
			{
				if ( persona.name == '' )
				{
					// If default, create it!
					if ( !this.defaultPersonalities[ token ] )
						return this.newError( { message: 'awi:persona-not-found', data: token } );
					for ( var p in this.defaultPersonalities[ token ] )
						persona[ p ] = this.defaultPersonalities[ token ][ p ];
				}
				this.awi.configuration.setPersona( token, persona );
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
}
