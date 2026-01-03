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
* @file aitranslator.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Translator connector, translate text
*
*/
import ConnectorAIBase from './aibase.mjs'
import axios from 'axios'
export { ConnectorAITranslator as Connector }

class ConnectorAITranslator extends ConnectorAIBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'Translator';
		this.token = 'aitranslator';
		this.group = 'ai';
		this.classname = 'ConnectorAITranslator';
		this.version = '0.5';

		this.cancelled = false;
		this.messageCount = 0;
		this.user = '';
		this.configuration = null;
	}
	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.translate = this.command_translate.bind(this);
		return this.newAnswer( info );
	}
	async setUser( args, basket, control )
	{
		return super.setUser( args, basket, control );
	}

	/////////////////////////////////////////////////////////////////////////
	async command_translate( args )
	{
		if ( !this.configuration )
			return this.newError({ message: 'awi:user-not-connected' }, { stack: new Error().stack } );

		var { text, sourceLanguage, targetLanguage, providers } = this.awi.getArgs(
			[ 'text', 'sourceLanguage', 'targetLanguage', 'providers' ],
			args, basket,
			[ '', '', '', [ 'xai' ] ] );        // , 'openai', 'google'
		if ( !text || !sourceLanguage || !targetLanguage )
			return this.newError({ message: 'awi:missing-argument', data: 'text, sourceLanguage, targetLanguage' }, { stack: new Error().stack });
		const data = {
			providers: providers.join( ',' ),
			text: text,
			source_language: sourceLanguage,
			target_language: targetLanguage,
		};
		if ( control && control.editor )
		{
			var debug = this.awi.messages.format( `~{text}~
sourceLanguage: ~{sourceLanguage}~
targetLanguage: ~{targetLanguage}~
model: ~{providers}~`, {} );
			control.editor.print( debug.split( '\n' ), { user: 'completion' } );
		}

		if ( !this.configuration )
			return this.newError({ message: 'awi:configuration_not_found' }, { stack: new Error().stack });

		var answer;
		var self = this;
		var options = {
			method: "POST",
			url: "https://api.edenai.run/v2/translation/automatic_translation",
			headers: {
				authorization: 'Bearer ' + this.configuration.key
			},
			data: data,
		};

		axios.request( options )
			.then( function( response )
			{
				var responses = [];
				for(var p = 0; p < providers.length; p++)
				{
					if ( response.data[ providers[p] ] && response.data[ providers[p] ].text )
					{
						responses.push({ provider: providers[p], text: response.data[ providers[p] ].text });
					}
				}
				answer = self.newAnswer( responses );
			} )
			.catch( function( err )
			{
				answer = self.newError({ message: 'translate-error', data: err }, { stack: new Error().stack });
			} );

		while( !answer )
			await new Promise( resolve => setTimeout( resolve, 1 ) );
		return answer;
	}
}
