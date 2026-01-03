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
* @file aitext.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Text connector, all AI text-related functions
*
*/
import ConnectorAIBase from './aibase.mjs'
import axios from 'axios'
export { ConnectorAIText as Connector }
class ConnectorAIText extends ConnectorAIBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'AI Text';
		this.token = 'aitext';
		this.group = 'ai';
		this.classname = 'ConnectorAIText';
		this.version = '0.5';
	}
	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.textToSummary = this.command_textToSummary.bind(this);
		info[ this.token ].commands.chatCompletion = this.command_chatCompletion.bind(this);
		return this.newAnswer( info );
	}
	async setUser( args, basket, control )
	{
		return super.setUser( args, basket, control );
	}

	/////////////////////////////////////////////////////////////////////////
	async command_textToSummary( args )
	{
		if ( !this.configuration )
			return this.newError({ message: 'awi:user-not-connected' }, { stack: new Error().stack });

		var { text, options } = this.awi.getArgs( [ 'text', 'options' ], args, {}, [
			'',
			{
				language: 'en',
				providers: [ 'openai' ],
				output_sentences: 5
			} ] );
		if ( !text )
			return this.newError({ message: 'awi:missing-argument', data: 'text' }, { stack: new Error().stack });

		var providersToSend = '';
		for (var p = 0; p < options.providers.length; p++)
		{
			if ( providersToSend )
				providersToSend += ',';
			providersToSend += options.providers[p];
		}
		const postOptions =
		{
			method: "POST",
			url: "https://api.edenai.run/v2/text/summarize",
			headers: {
				authorization: "Bearer " + this.configuration.aiKey,
			},
			data: {
				output_sentences: options.output_sentences,
				providers: providersToSend,
				text: text,
				language: options.language,
			},
		};

		var self = this;
		return new Promise( resolve => {
			axios.request( postOptions )
				.then( function( response )
				{
					var responses = [];
					for(var p = 0; p < options.providers.length; p++)
					{
						if ( response.data[ options.providers[p] ] && response.data[ options.providers[p] ].text )
						{
							responses.push({ provider: options.providers[p], text: response.data[ options.providers[p] ].text });
						}
					}
					resolve(self.newAnswer( responses ));
				} )
				.catch( function( err )
				{
					resolve(self.newError( { message: 'awi:text-to-summary-error', data: err }, { stack: new Error().stack } ));
				});
		});
	}

	/////////////////////////////////////////////////////////////////////////
	// Chat completion for text generation from prompt
	// Uses Eden AI unified LLM endpoint: https://api.edenai.run/v2/llm/chat
	// 
	// Parameters:
	//   prompt: string - The user prompt text
	//   systemPrompt: string - System instruction (optional)
	//   ai: object - AI configuration from section definition, passed directly:
	//     {
	//       provider: "openai",              // Provider name
	//       model: "gpt-4o",                 // Model name (combined as "provider/model")
	//       temperature: 0.7,                // 0.0-1.0
	//       maxTokens: 4096,                 // Max output tokens
	//       fallbackModel: "anthropic/claude-3-5-sonnet-latest",  // Optional fallback
	//       topP: 1.0,                       // Optional nucleus sampling
	//       frequencyPenalty: 0,             // Optional
	//       presencePenalty: 0,              // Optional
	//       reasoningEffort: "medium"        // Optional: "low", "medium", "high"
	//     }
	/////////////////////////////////////////////////////////////////////////
	async command_chatCompletion( args )
	{
		if ( !this.configuration )
			return this.newError({ message: 'awi:user-not-connected' }, { stack: new Error().stack });

		var { prompt, systemPrompt, ai } = this.awi.getArgs( [ 'prompt', 'systemPrompt', 'ai' ], args, {}, [
			'',
			'',
			{}
		]);

		if ( !prompt )
			return this.newError({ message: 'awi:missing-argument', data: 'prompt' }, { stack: new Error().stack });

		// Apply defaults for missing ai config values
		const provider = ai.provider || 'openai';
		const model = ai.model || 'gpt-4o';
		const fullModel = (typeof model === 'string' && model.indexOf('/') >= 0) ? model : (provider + '/' + model);

		this.awi.log( 'Chat completion request', { source: 'aitext', level: 'info', functionName: 'command_chatCompletion', model: fullModel } );

		// Build messages array
		const messages = [];
		if ( systemPrompt )
			messages.push({ role: 'system', content: systemPrompt });
		messages.push({ role: 'user', content: prompt });

		// Build request payload - pass ai config values directly
		const payload = {
			model: fullModel,
			messages: messages
		};

		// Add optional parameters from ai config if present
		if ( ai.temperature !== undefined )
			payload.temperature = ai.temperature;
		else
			payload.temperature = 0.7;

		if ( ai.maxTokens !== undefined )
			payload.max_tokens = ai.maxTokens;
		else
			payload.max_tokens = 4096;

		if ( ai.fallbackModel )
			payload.fallback_model = ai.fallbackModel;
		if ( ai.topP !== undefined )
			payload.top_p = ai.topP;
		if ( ai.frequencyPenalty !== undefined )
			payload.frequency_penalty = ai.frequencyPenalty;
		if ( ai.presencePenalty !== undefined )
			payload.presence_penalty = ai.presencePenalty;
		if ( ai.reasoningEffort )
			payload.reasoning_effort = ai.reasoningEffort;
		if ( ai.seed !== undefined )
			payload.seed = ai.seed;
		if ( ai.stop )
			payload.stop = ai.stop;

		const postOptions = {
			method: "POST",
			url: "https://api.edenai.run/v2/llm/chat",
			headers: {
				authorization: "Bearer " + this.configuration.aiKey,
				"Content-Type": "application/json",
				"Accept": "application/json"
			},
			data: payload
		};
		var self = this;
		return new Promise( resolve => {
			const doRequest = (options) => axios.request(options);
			const extractText = (data) => {
				try
				{
					const choices = data?.choices;
					const content = choices && choices.length > 0 && choices[0].message ? choices[0].message.content : '';
					const text = (content === undefined || content === null) ? '' : String(content);
					return text.trim() ? text : '';
				}
				catch (e)
				{
					return '';
				}
			};
			const doRetryFallback = (originLabel, originalModel, retryModel) => {
				self.awi.log( 'Chat completion retrying with fallback model', { source: 'aitext', level: 'warning', functionName: 'command_chatCompletion', origin: originLabel, model: originalModel, fallback: retryModel } );
				const retryPayload = { ...payload, model: retryModel };
				delete retryPayload.fallback_model;
				const retryOptions = { ...postOptions, data: retryPayload };
				return doRequest( retryOptions )
					.then( function( response )
					{
						const text = extractText( response.data );
						if ( text )
						{
							self.awi.log( 'Chat completion success (fallback model)', { source: 'aitext', level: 'info', functionName: 'command_chatCompletion', model: retryModel } );
							resolve( self.newAnswer({
								text: text,
								model: retryModel,
								usage: response.data.usage || null,
								finishReason: response.data?.choices?.[0]?.finish_reason
							}));
						}
						else
						{
							self.awi.log( 'Chat completion no response (fallback model)', { source: 'aitext', level: 'warning', functionName: 'command_chatCompletion', model: retryModel, response: JSON.stringify(response.data)?.slice(0, 2000) } );
							resolve( self.newError(
                { message: 'awi:chat-completion-no-response', data: retryModel }, 
                { stack: new Error().stack }));
						}
					})
					.catch( function( err2 )
					{
						const errMsg2 = err2.response?.data?.error?.message || err2.message || err2;
						self.awi.log( 'Chat completion error (fallback model)', { source: 'aitext', level: 'error', functionName: 'command_chatCompletion', error: errMsg2 } );
						resolve( self.newError(
							{ message: 'awi:chat-completion-error', data: errMsg2 },
							{ stack: new Error().stack },
							{
								payload: retryPayload,
								status: err2.response?.status,
								responseData: err2.response?.data,
								responseHeaders: err2.response?.headers
							}
						));
					});
			};
			doRequest( postOptions )
				.then( function( response )
				{
					const text = extractText( response.data );
					if ( text )
					{
						self.awi.log( 'Chat completion success', { source: 'aitext', level: 'info', functionName: 'command_chatCompletion', model: fullModel } );
						resolve( self.newAnswer({
							text: text,
							model: fullModel,
							usage: response.data.usage || null,
							finishReason: response.data?.choices?.[0]?.finish_reason
						}));
					}
					else
					{
						// Ensure fallback model is properly formatted with provider/model-name
						let retryModel = payload.fallback_model || 'openai/gpt-4-turbo';
						if (retryModel.indexOf('/') === -1) {
							// Default to OpenAI if no provider specified
							retryModel = `openai/${retryModel}`;
						}
						
						// Don't retry with the same model to avoid infinite loops
						if (retryModel === fullModel) {
							retryModel = 'anthropic/claude-sonnet-4-5';
							if (retryModel === fullModel) {
								retryModel = 'openai/gpt-4-turbo';
							}
						}
						
						self.awi.log( 'Chat completion no response', { source: 'aitext', level: 'warning', functionName: 'command_chatCompletion', model: fullModel, fallback: retryModel, response: JSON.stringify(response.data)?.slice(0, 2000) } );
						return doRetryFallback( 'no-response', fullModel, retryModel );
					}
				})
				.catch( function( err )
				{
					const status = err.response?.status;
					const errMsg = err.response?.data?.error?.message || err.message || err;
					const canRetryModel = status === 404 && typeof errMsg === 'string' && errMsg.toLowerCase().indexOf('does not exist') >= 0;
					if (canRetryModel)
					{
						const retryModel = payload.fallback_model || 'openai/gpt-4-turbo';
						return doRetryFallback( 'model-not-found', payload.model, retryModel );
					}
					self.awi.log( 'Chat completion error', { source: 'aitext', level: 'error', functionName: 'command_chatCompletion', error: errMsg } );
					resolve( self.newError(
						{ message: 'awi:chat-completion-error', data: errMsg },
						{ stack: new Error().stack },
						{
							payload: payload,
							status: status,
							responseData: err.response?.data,
							responseHeaders: err.response?.headers
						}
					));
				});
		});
	}
}
