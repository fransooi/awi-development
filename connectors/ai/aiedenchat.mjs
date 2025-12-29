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
* @file aichat.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Chat connector, handle a conversation
*
*/
import axios from 'axios'
import ConnectorAIBase from './aibase.mjs'
export { ConnectorAIChat as Connector }

class ConnectorAIChat extends ConnectorAIBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'Chat';
		this.token = 'aichat';
		this.group = 'ai';
		this.classname = 'ConnectorAIChat';
		this.version = '0.5';
		this.cancelled = false;
		this.messageCount = 0;
		this.configuration = {
			messages: [],
			reasoning_effort: 'medium',
			metadata: [],
			temperature: 0.7,
			n: 1,
			frequency_penalty: 0,
			presence_penalty: 0,
			max_completion_tokens: 150,
			//seed: 0,
			aiKey: ''
		}
	}
	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.send = this.send.bind(this);
		return this.newAnswer( info );
	}
	async setUser( args, basket, control )
	{
		return super.setUser( args, basket, control );
	}

	/////////////////////////////////////////////////////////////////////////
	async generate( options )
	{
		if ( !this.configuration.aiKey )
			return this.newError({ message: 'awi:ai-key-missing' });

		const systemPrompt = options.system || '';
		const userPrompt = options.prompt || '';
		const requireJson = options.json || false;

		// Construct the effective prompt for EdenAI
		// We use the 'openai' provider by default as it's reliable for instructions, 
		// but this can be configured.
		const provider = this.configuration.providers || 'openai';

		const data = {
			providers: provider,
			text: userPrompt,
			chatbot_global_action: systemPrompt,
			previous_history: [], // No history for single-shot parsing
			temperature: this.configuration.temperature || 0.1, // Low temp for logic
			max_tokens: this.configuration.max_completion_tokens || 1000,
		};

		// If json is requested, ensure the prompt explicitly asks for it (double check)
		// though the parser already does this.

		try {
			const response = await axios.post('https://api.edenai.run/v2/text/chat', data, {
				headers: {
					'Authorization': 'Bearer ' + this.configuration.aiKey,
					'Content-Type': 'application/json'
				}
			});

			if (response.data && response.data[provider]) {
				const result = response.data[provider];
				if (result.status === 'success' || result.generated_text) {
					return result.generated_text;
				}
			}
			return this.newError({ message: 'awi:ai-provider-error', data: response.data });

		} catch (error) {
			return this.newError({ message: 'awi:ai-request-failed', data: error.message });
		}
	}

	async send( args, basket, control )
	{
		if ( !this.configuration.aiKey )
			return this.newError({ message: 'awi:user-not-connected' });

		var { prompt } = this.awi.getArgs( 'prompt', args, basket, [ '' ] );
		prompt = prompt.trim();
		var data =
		{
			temperature: this.configuration.temperature,
			n: this.configuration.n,
			max_completion_tokens: this.configuration.max_completion_tokens,
			providers: this.configuration.providers,
			text: prompt,
			chatbot_global_action: basket.globalAction,
			previous_history: basket.history
		};
		/*
		var debug = this.awi.messages.format( `prompt: ~{text}~
model: ~{providers}~
temperature: ~{temperature}~
max_tokens: ~{max_tokens}~`, data );
		control.editor.print( debug.split( '\n' ), { user: 'information' } );
		*/
		return this.newAnswer( 'AI Chat not implemented yet.', 'awi:chat-answer' );
		/*
		var answer;
		var self = this;
		var options = {
			method: 'POST',
			url: 'https://api.edenai.run/v2/text/chat',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
				authorization: 'Bearer ' + this.configuration.aiKey
			},
			data: data
		};

		axios.request( options )
			.then( function( response )
			{
				answer = self.newAnswer( response.data[ data.providers ].generated_text, 'awi:chat-answer' );
			} )
			.catch( function( err )
			{
				answer = self.newError( err );
			} );

		while( !answer )
			await new Promise( resolve => setTimeout( resolve, 1 ) );
		return answer;
		*/
	}
}
