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
* @file parser.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short English language parser based on Compromise
*
*/
import ConnectorBase from '../../connector.mjs'
//import Nlp from 'compromise'
export { ConnectorParser as Connector }

class ConnectorParser extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Parser';
		this.token = 'parser';
		this.className = 'ConnectorParser';
		this.group = 'awi';
		this.version = '0.5';
	}
	async connect( options )
	{
		super.connect( options );
		this.setConnected( true );
		return this.connectAnswer;
	}
	async preparePrompt( args, basket, control )
	{
		var { prompt, tokens } = this.awi.getArgs( [ 'prompt', 'tokens' ], args, basket, [ '', [] ] );
		if ( !prompt )
			return this.newError( { message: 'awi:nothing-to-prompt' } );

		// 1. Try mechanical parsing first (fast path for strict syntax)
		var mechanical = this.tokeniseExpression( { prompt: prompt, tokens: tokens, position: 0 } );
		
		// If mechanical parser found a specific bubble command (not just a generic chat bubble), use it.
		// Or if the prompt is very short/strict.
		var hasSpecificCommand = mechanical.data.tokens.some(t => t.type === 'bubble' && t.token !== 'chat');
		
		if (hasSpecificCommand) {
			return mechanical;
		}

		// 2. Fallback to Semantic Parsing (Slow path for natural language)
		// Only if we have an AI connection
		if (this.awi.aichat) {
			control.editor.print( '.(..) ', { user: 'awi', newLine: false } ); // "Thinking" animation
			return await this.semanticParse(prompt, basket, control);
		}

		return mechanical;
	}

	async semanticParse(prompt, basket, control) {
		// 1. Gather available tools (Bubbles)
		var tools = [];
		for (var groupName in this.awi.bubbleGroups) {
			var group = this.awi.bubbleGroups[groupName];
			for (var bubbleName in group) {
				var bubbleClass = group[bubbleName];
				// Instantiate a temporary bubble to get its metadata if needed, 
				// or access static properties if available. 
				// For now, we assume we need to instantiate to get the config/properties.
				// Optimization: Cache this description list.
				try {
					var b = new bubbleClass.Bubble(this.awi, {});
					tools.push({
						name: b.name,
						token: b.token,
						group: b.group,
						description: b.properties.action,
						inputs: b.properties.inputs
					});
				} catch(e) {}
			}
		}

		// 2. Construct System Prompt
		var systemPrompt = `You are the parsing engine for AWI. Your job is to translate user requests into JSON commands.
Available Tools:
${JSON.stringify(tools, null, 2)}

Instructions:
- specificy the 'group' and 'token' of the tool to use.
- Extract parameters from the user's request into 'parameters'.
- If the user's request matches a tool, output a JSON array of token objects.
- Token Object Format: { "type": "bubble", "token": "<token>", "group": "<group>", "parameters": { "<param_name>": ["<value>"] } }
- If no tool matches, or it's just conversation, output: { "type": "bubble", "token": "chat", "group": "awi", "parameters": { "question": ["<user_prompt>"] } }
- Output ONLY valid JSON.
`;

		// 3. Call LLM
		try {
			// specific call to AI for raw JSON generation
			// We assume awi.aichat can handle a system prompt or we append it.
			// This might need adjustment based on the actual AI connector capabilities.
			var response = await this.awi.aichat.generate({
				system: systemPrompt,
				prompt: prompt,
				json: true // Request JSON mode if supported
			});

			var tokens = JSON.parse(response);
			if (!Array.isArray(tokens)) tokens = [tokens];

			// Validate and fix structure if necessary to match AWI engine expectations
			tokens.forEach(t => {
				if (!t.config) t.config = {};
				// Ensure parameters are arrays (as expected by the engine's extraction logic)
				for (var p in t.parameters) {
					if (!Array.isArray(t.parameters[p])) {
						t.parameters[p] = [{ type: 'string', default: t.parameters[p] }];
					} else {
						// Ensure the array contains typed objects
						t.parameters[p] = t.parameters[p].map(v => {
							if (typeof v === 'object' && v.type) return v;
							return { type: 'string', default: v };
						});
					}
				}
			});

			return this.newAnswer({ prompt: prompt, tokens: tokens }, 'awi:answer');

		} catch (e) {
			control.editor.print( '.(**) ', { user: 'error', newLine: false } ); // Error face
			return this.tokeniseExpression({ prompt: prompt, tokens: [], position: 0 }); // Fallback to mechanical
		}
	}

	tokeniseExpression( info )
	{
		var skip = false;
		var testPosition;
		var description = '';
		while( !info.eol )
		{
			this.awi.utilities.skipSpaces( info );
			var start = info.position;
			this.awi.utilities.extractNextParameter( info, [ '(', ')', '.', '+', '-', '*', '/' ] );
			if ( info.eol )
				break;
			if ( info.type == 'word' && info.delimiter == '.' )
			{
				skip = true;
				testPosition = info.position;
				var group = info.value;
				this.awi.utilities.extractNextParameter( info, [ '(' ] );
				if ( info.eol )
					break;
				if ( this.awi.bubbleGroups[ group ] && info.delimiter == '(' )
				{
					var bubble = this.awi.bubbleGroups[ group ][ info.value ];
					if ( bubble )
					{
						skip = true;
						var token = {
							type: 'bubble',
							token: info.value,
							group: group,
							config: {},
							parameters: {}
						}
						var count = 1;
						var param = 0;
						var inputs = bubble.properties.inputs;
						do
						{
							var infoBracket = this.awi.utilities.copyObject( info );
							this.awi.utilities.extractNextParameter( infoBracket, [ '(', ')', ',' ] );
							while( !infoBracket.eol )
							{
								if ( infoBracket.delimiter == '(' )
									count++;
								else if ( infoBracket.delimiter == ')' )
								{
									count--;
									if ( count == 0 )
										break;
								}
								else if ( infoBracket.delimiter == ',' )
									break;
								this.awi.utilities.extractNextParameter( infoBracket, [ '(', ')', ',' ] );
							}
							if ( !infoBracket.eol )
							{
								var tokens = [];
								this.tokeniseExpression( { prompt: info.prompt.substring( info.position, infoBracket.position ), position: 0, tokens: tokens, bracketCount: 1 } );
								if ( param < inputs.length && tokens.length > 0 )
								{
									token.parameters[ inputs[ param ].name ] = tokens;
									param++;
								}
								info.position = infoBracket.position;
							}
							if ( count == 0 )
								break;
						} while( !info.eol )
						info.tokens.push( token );
						info.prompt = info.prompt.substring( 0, start ) + info.prompt.substring( info.position );
						info.position = start;
					}
				}
			}
			
			// Implicit 'awi' group support (e.g. 'setup' -> 'awi.setup')
			if ( !skip && info.type == 'word' && (info.delimiter == '' || info.delimiter == ' ' || info.delimiter == '(') )
			{
				if ( this.awi.bubbleGroups['awi'] && this.awi.bubbleGroups['awi'][info.value] )
				{
					var group = 'awi';
					var bubble = this.awi.bubbleGroups[group][info.value];
					
					// If delimiter is not '(', we treat it as a command without arguments (or default args)
					// But we need to handle the case where it IS a function call style 'setup('
					
					var isFunctionCall = (info.delimiter == '(');
					
					// For simple words (no '('), we just consume the word and create the token
					// For '(', we fall into similar logic as above but without the 'group.' prefix check
					
					if (isFunctionCall) {
						// It's a function call like setup(...)
						// We need to parse arguments
						
						var token = {
							type: 'bubble',
							token: info.value,
							group: group,
							config: {},
							parameters: {}
						}
						var count = 1;
						var param = 0;
						var inputs = bubble.properties.inputs;
						
						// We are currently at the '(' delimiter
						// The logic above advances info.position. 
						// We need to advance into the brackets.
						
						// Re-use logic? It's complex to duplicate.
						// Let's just manually handle the bracket parsing or try to jump to the logic above?
						// Actually, the logic above relies on "group" being the previous word.
						// Here, "info.value" IS the token name.
						
						// We can implement a simplified parser for this block
						do
						{
							var infoBracket = this.awi.utilities.copyObject( info );
							this.awi.utilities.extractNextParameter( infoBracket, [ '(', ')', ',' ] );
							while( !infoBracket.eol )
							{
								if ( infoBracket.delimiter == '(' )
									count++;
								else if ( infoBracket.delimiter == ')' )
								{
									count--;
									if ( count == 0 )
										break;
								}
								else if ( infoBracket.delimiter == ',' )
									break;
								this.awi.utilities.extractNextParameter( infoBracket, [ '(', ')', ',' ] );
							}
							if ( !infoBracket.eol )
							{
								var tokens = [];
								this.tokeniseExpression( { prompt: info.prompt.substring( info.position, infoBracket.position ), position: 0, tokens: tokens, bracketCount: 1 } );
								if ( param < inputs.length && tokens.length > 0 )
								{
									token.parameters[ inputs[ param ].name ] = tokens;
									param++;
								}
								info.position = infoBracket.position;
							}
							if ( count == 0 )
								break;
						} while( !info.eol )
						
						info.tokens.push( token );
						info.prompt = info.prompt.substring( 0, start ) + info.prompt.substring( info.position );
						info.position = start;
						skip = true;
					} 
					else 
					{
						// Simple command: "setup"
						var token = {
							type: 'bubble',
							token: info.value,
							group: group,
							config: {},
							parameters: {}
						};
						info.tokens.push( token );
						// Cut out the word
						info.prompt = info.prompt.substring( 0, start ) + info.prompt.substring( info.position );
						info.position = start;
						skip = true;
					}
				}
			}

			if ( skip )
			{
				skip = false;
				info.position = testPosition;
				continue;
			}
			var toCut = -1;
			if ( info.type == 'int' || info.type == 'float' || info.type == 'string' )
			{
				info.tokens.push( { type: info.type, default: info.value } );
				toCut = info.position;
			}
			if ( info.type == 'word' && info.bracketCount > 0 )
			{
				if ( info.tokens.length > 0 && info.tokens[ info.tokens.length - 1 ].type == 'string' )
					info.tokens[ info.tokens.length - 1 ].value += ( info.value + ' ' );
				else
					info.tokens.push( { type: 'string', value: info.value + ' ' } );
				toCut = info.position;
			}
			switch ( info.delimiter )
			{
				case '(':
					var count = 1;
					var start = info.position;
					this.awi.utilities.extractNextParameter( info, [ '(', ')' ] );
					while( !info.eol )
					{
						if ( info.delimiter == '(' )
							count++;
						else if ( info.delimiter == ')' )
						{
							count--;
							if ( count == 0 )
								break;
						}
						this.awi.utilities.extractNextParameter( info, [ '(', ')' ] );
					}
					var tokens = [];
					var text = info.prompt.substring( start, info.position );
					info.tokens.push( { type: 'open', tokens: tokens } );
					this.tokeniseExpression( { prompt: text, position: 0, tokens: tokens } );
					toCut = info.position;
					break;
				case '+':
					info.tokens.push( { value: 'plus', type: 'operator' } );
					toCut = info.position;
					break;
				case '-':
					info.tokens.push( { value: 'minus', type: 'operator' } );
					toCut = info.position;
					break;
				case '*':
					info.tokens.push( { value: 'mult', type: 'operator' } );
					toCut = info.position;
					break;
				case '/':
					info.tokens.push( { value: 'div', type: 'operator' } );
					toCut = info.position;
					break;
				case '=':
					info.tokens.push( { value: 'equal', type: 'operator' } );
					toCut = info.position;
					break;
				case ')':
					info.bracketCount--;
					toCut = info.position;
					if ( info.bracketCount == 0 )
					{
						info.eol = true;
						break;
					}
					error = 'syntax';
					break;
				default:
					break;
			}
			if ( toCut >= 0 )
			{
				info.prompt = info.prompt.substring( 0, start ) + info.prompt.substring( toCut );
				info.position = start;
				toCut = -1;
			}
		}
		// Remainder of the prompt as Chat bubble
		if ( info.prompt.length > 0 )
		{
			info.tokens.push( {
				type: 'bubble',
				token: 'chat',
				group: 'awi',
				config: {},
				parameters: {
					'question': [ {
						type: 'string', default: info.prompt
					} ]
				}
			} );
		}
		return this.newAnswer( { prompt: info.prompt, tokens: info.tokens }, 'awi:answer' );
	}
}
