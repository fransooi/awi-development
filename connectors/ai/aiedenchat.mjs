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
		this.className = 'ConnectorAIChat';
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
			max_completion_tokens: 1000,
			//seed: 0,
			aiKey: ''
		}
		this.history = [];
		this.lastCallTime = 0;
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
		// Auto-recover AI Key from configuration if missing
		if ( !this.configuration.aiKey && this.awi.configuration.getUserKey() )
			this.configuration.aiKey = this.awi.configuration.getUserKey();

		if ( !this.configuration.aiKey )
			return this.newError({ message: 'awi:ai-key-missing' }, { functionName: 'generate' });

		const systemPrompt = options.system || '';
		const userPrompt = options.prompt || '';
		const requireJson = options.json || false;
		const saveHistory = options.saveHistory || false;

		// Rate limiting: Wait if calls are too frequent (min 2s interval)
		const now = Date.now();
		const minInterval = 2000;
		const timeSinceLast = now - this.lastCallTime;
		if (timeSinceLast < minInterval) {
			const waitTime = minInterval - timeSinceLast;
			await new Promise(resolve => setTimeout(resolve, waitTime));
		}
		this.lastCallTime = Date.now();

		// Construct the effective prompt for EdenAI
		// Use fallbacks by default: OpenAI, Google, Anthropic
		const providersString = this.configuration.providers || 'openai,google,anthropic';
		
		const data = {
			providers: providersString,
			text: userPrompt,
			chatbot_global_action: systemPrompt,
			previous_history: saveHistory ? this.history : [], // Use history if requested
			temperature: options.temperature || this.configuration.temperature || 0.1, // Low temp for logic
			max_tokens: options.max_tokens || this.configuration.max_completion_tokens || 1000,
			fallback_providers: '' // EdenAI uses the comma-separated providers list for fallbacks/simultaneous calls
		};

		// console.log('DEBUG: AIChat Payload:', JSON.stringify(data, null, 2));

		const maxRetries = 5;
		let lastError = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				if (attempt > 0) {
					// Exponential backoff: 1s, 2s, 4s...
					const backoff = 1000 * Math.pow(2, attempt - 1);
					await new Promise(resolve => setTimeout(resolve, backoff));
				}

				const response = await axios.post('https://api.edenai.run/v2/text/chat', data, {
					headers: {
						'Authorization': 'Bearer ' + this.configuration.aiKey,
						'Content-Type': 'application/json'
					}
				});

				// Check providers in order
				const providerList = providersString.split(',').map(p => p.trim());
				
				for (const provider of providerList) {
					if (response.data && response.data[provider]) {
						const result = response.data[provider];
						if (result.status === 'success' || result.generated_text) {
							if (saveHistory) {
								this.history.push({ role: 'user', message: userPrompt });
								this.history.push({ role: 'assistant', message: result.generated_text });
							}
							return result.generated_text;
						}
					}
				}
				
				// If we get here, no provider succeeded in this response
				lastError = { message: 'awi:ai-all-providers-failed', data: response.data };
				// Continue to next retry attempt

			} catch (error) {
				lastError = { message: 'awi:ai-request-failed', data: error.message };
				// Continue to next retry attempt
			}
		}

		// Friendly error handling for AI refusal
		if (lastError && lastError.message === 'awi:ai-all-providers-failed' && options.control) {
			try {
				options.control.editor.print('AI Debug: ' + JSON.stringify(lastError.data), { user: 'debug2', verbose: 4 });
			} catch(e) {}

			options.control.editor.print( 'AI Refusal: The request may have been rejected by the provider.', { user: 'warning' } );
			options.control.editor.print( 'Hint: Using the names of living public figures often triggers safety filters.', { user: 'warning' } );
			
			// Return a silent error (no system log) so parser can fallback
			const silentAnswer = this.newAnswer(lastError, null);
			silentAnswer.setMessage(lastError.message);
			silentAnswer.setError(lastError.message);
			return silentAnswer;
		}

		return this.newError(lastError || { message: 'awi:ai-request-failed' }, { functionName: 'generate' });
	}

	async send( args, basket, control )
	{
		if ( !this.configuration.aiKey )
			return this.newError({ message: 'awi:user-not-connected' }, { functionName: 'send' });

		var { prompt } = this.awi.getArgs( 'prompt', args, basket, [ '' ] );
		prompt = prompt.trim();
		
		// Use generate to handle the actual call
		try {
			var response = await this.generate({
				prompt: prompt,
				system: basket.globalAction || 'You are a helpful assistant.',
				json: false,
				saveHistory: true,
				control: control
			});
			
			if (response && response.isError && response.isError()) {
				return response;
			}
			
			return this.newAnswer( response, 'awi:chat-answer' );
		} catch (e) {
			return this.newError({ message: 'awi:chat-failed', data: e.message }, { functionName: 'send' });
		}
	}
}
