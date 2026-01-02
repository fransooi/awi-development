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
		var { prompt } = this.awi.getArgs( [ 'prompt' ], args, basket, [ '' ] );
		var { tokens } = this.awi.getArgs( [ 'tokens' ], args, {}, [ [] ] );
		
		if ( !prompt )
			return this.newError( { message: 'awi:nothing-to-prompt' } );

		// 1. Try mechanical parsing first (fast path for strict syntax)
		var mechanical = this.tokeniseExpression( { prompt: prompt, tokens: tokens, position: 0 } );
		
		if ( mechanical.isError() ) {
			// console.log(`[PARSER-DEBUG] Mechanical parse error: ${mechanical.message}`);
		} else if (mechanical.data && mechanical.data.tokens) {
			// const tokenTypes = mechanical.data.tokens.map(t => t.type + ':' + (t.token || t.value));
			// console.log(`[PARSER-DEBUG] Mechanical tokens: ${JSON.stringify(tokenTypes)}`);
		}

		// If mechanical parser found a specific bubble command (not just a generic chat bubble), use it.
		// Or if the prompt is very short/strict.
		var hasSpecificCommand = false;
		if (mechanical.isSuccess() && mechanical.data && mechanical.data.tokens) {
			hasSpecificCommand = mechanical.data.tokens.some(t => t.type === 'bubble' && t.token !== 'chat');
		}
		
		// console.log('DEBUG: Mechanical hasSpecificCommand:', hasSpecificCommand);

		if (hasSpecificCommand) {
			return mechanical;
		}

		// 2. Fallback to Semantic Parsing (Slow path for natural language)
		// Only if we have an AI connection
		if (this.awi.aichat) {
			// console.log('DEBUG: Calling semanticParse...');
			control.editor.print( '...', { user: 'result', newLine: true } ); // "Thinking" animation
			return await this.semanticParse(prompt, basket, control);
		} else {
			// console.log('DEBUG: No AI Chat connector found.');
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

		// 1b. Gather available procedures from Persona
		var procedures = [];
		var persona = this.awi.configuration.getPersona('user');
		
		// Helper to load persona if missing
		const ensurePersonaLoaded = async (token) => {
			let p = this.awi.configuration.getPersona(token);
			if (!p && this.awi.persona && this.awi.persona.loadPersonaFromFile) {
				try {
					p = await this.awi.persona.loadPersonaFromFile(token);
					if (p) this.awi.configuration.setPersona(token, p);
				} catch (e) {}
			}
			return p;
		};

		// Ensure current persona is loaded
		if (!persona) {
			let token = 'awi'; // Default
			const userConfig = this.awi.configuration.getConfig('user');
			if (userConfig && userConfig.persona) token = userConfig.persona;
			persona = await ensurePersonaLoaded(token);
		}

		// Also ensure 'awi' system persona is loaded if current is different
		let systemPersona = null;
		if (persona && persona.token !== 'awi') {
			systemPersona = await ensurePersonaLoaded('awi');
		}

		// Collect procedures from Current Persona
		const addProcedures = (pSource) => {
			if (pSource && pSource.procedures) {
				for (var procName in pSource.procedures) {
					// Avoid duplicates (Current persona overrides System)
					if (procedures.some(p => p.name === procName)) continue;

					var proc = pSource.procedures[procName];
					var description = "Execute procedure " + procName;
					var parameters = [];
					
					if (Array.isArray(proc)) {
						description = "Executes the '" + procName + "' procedure.";
					} else if (proc.steps) {
						if (proc.description) description = proc.description;
						if (proc.parameters) parameters = proc.parameters;
					}
					
					procedures.push({
						name: procName,
						description: description,
						parameters: parameters
					});
				}
			}
		};

		addProcedures(persona);
		addProcedures(systemPersona);


		// 2. Construct System Prompt
		var systemPrompt = `You are the parsing engine for AWI. Your job is to translate user requests into JSON commands.

Available Procedures (High Priority - Check these first):
${JSON.stringify(procedures)}

Available Tools (Bubbles):
${JSON.stringify(tools)}

Instructions:
1. CHECK PROCEDURES FIRST: Does the user's request match the intent of any "Available Procedure"?
   - If YES, output a JSON object calling the 'procedure' bubble.
   - Map parameters carefully: The procedure's 'parameters' list defines the order.
     - 1st defined parameter -> param1
     - 2nd defined parameter -> param2
     - 3rd defined parameter -> param3
     - 4th defined parameter -> param4
     - 5th defined parameter -> param5
   - Token Object Format: { "type": "bubble", "token": "procedure", "group": "awi", "parameters": { "name": ["<procedure_name>"], "param1": ["<val1>"], "param2": ["<val2>"], "param3": ["<val3>"], "param4": ["<val4>"], "param5": ["<val5>"] } }

2. CHECK TOOLS: If no procedure matches, does it match a specific Tool (Bubble)?
   - Token Object Format: { "type": "bubble", "token": "<token>", "group": "<group>", "parameters": { "<param_name>": ["<value>"] } }

3. FALLBACK: If nothing matches, use the 'chat' bubble.
   - Token Object Format: { "type": "bubble", "token": "chat", "group": "awi", "parameters": { "question": ["<user_prompt>"] } }

Output ONLY valid JSON.
`;

		// 3. Call LLM
		try {
			// specific call to AI for raw JSON generation
			// We assume awi.aichat can handle a system prompt or we append it.
			// This might need adjustment based on the actual AI connector capabilities.
			var response = await this.awi.aichat.generate({
				system: systemPrompt,
				prompt: prompt,
				json: true, // Request JSON mode if supported
				control: control
			});

			// Check if response is an error object
			if (response && response.isError && response.isError()) {
				throw new Error(response.message || 'AI Generation failed');
			}

			var jsonStr = response;

			// Strip markdown code blocks if present
			if (typeof jsonStr === 'string') {
				jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
			}

			var tokens = JSON.parse(jsonStr);
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
			// control.editor.print( '.(**) ', { user: 'error', newLine: false } ); // Error face
			
			// Notify user of parser failure and fallback
			if (control && control.editor) {
				const msg = this.awi.messages && this.awi.messages.formatError ? 
					this.awi.messages.formatError(e) : (e.message || 'Unknown Error');
				
				control.editor.print( 'Parser Error: ' + msg, { user: 'error' } );
				control.editor.print( 'Falling back to direct AI prompt...', { user: 'info' } );
			}

			// Silently fallback to mechanical parsing if AI fails (e.g. network/provider error)
			// BETTER FALLBACK: Create a 'chat' bubble token so the system attempts to answer 
			// the user's input as a conversation, rather than doing nothing.
			
			// Construct a valid 'chat' bubble token
			var chatToken = {
				type: 'bubble',
				token: 'chat',
				group: 'awi',
				config: {},
				parameters: {
					question: [ { type: 'string', value: prompt, default: prompt } ]
				}
			};
			
			return this.newAnswer( { prompt: prompt, tokens: [ chatToken ] }, 'awi:answer' );

			// return this.tokeniseExpression({ prompt: prompt, tokens: [], position: 0 }); // OLD Fallback
		}
	}

	tokeniseExpression( info )
	{
		// info: { prompt, position, tokens }
		// Optional: info.depth (for recursion)
		if ( typeof info.depth === 'undefined' ) info.depth = 0;
		
		const len = info.prompt.length;
		
		let loopGuard = 0;
		while( info.position < len )
		{
			if (loopGuard++ > 100) {
				console.log('[PARSER-ERROR] Infinite loop detected in tokeniseExpression');
				break;
			}
			// console.log(`[PARSER-LOOP] pos=${info.position}/${len} char='${info.prompt.charAt(info.position)}'`);

			// Skip spaces
			this.awi.utilities.skipSpaces( info );
			
			if ( info.position >= len ) break;

			const start = info.position;
			const char = info.prompt.charAt( info.position );
			if ( char === '(' ) {
				info.depth++;
				info.position++;
				
				// Parse inner content recursively? 
				// The existing logic seemed to want to tokenize the *contents* into a sub-token list
				// OR it treats ( ) as grouping. 
				// The existing code: case '(': ... extracts until matching ')' ... calls tokeniseExpression
				
				// We need to find the matching closing bracket to recurse
				let innerDepth = 1;
				let innerStart = info.position;
				let innerEnd = -1;
				
				// Scan ahead for matching bracket
				let scanPos = info.position;
				while ( scanPos < len ) {
					const c = info.prompt.charAt(scanPos);
					if ( c === '(' ) innerDepth++;
					else if ( c === ')' ) innerDepth--;
					
					if ( innerDepth === 0 ) {
						innerEnd = scanPos;
						break;
					}
					scanPos++;
				}
				
				if ( innerEnd === -1 ) {
					return this.newError({ message: 'awi:syntax-error-missing-bracket', data: 'Missing closing bracket' });
				}
				
				// Recurse on content
				const innerContent = info.prompt.substring( innerStart, innerEnd );
				const innerTokens = [];
				const subInfo = { prompt: innerContent, position: 0, tokens: innerTokens, depth: 0 }; // depth 0 for new context
				const result = this.tokeniseExpression( subInfo );
				if ( result.isError() ) return result;
				
				info.tokens.push( { type: 'open', tokens: innerTokens } );
				info.position = innerEnd + 1; // Skip closing bracket
				info.depth--; 
				continue;
			}
			
			if ( char === ')' ) {
				return this.newError({ message: 'awi:syntax-error-extra-bracket', data: 'Unexpected closing bracket' });
			}

			// 2. Check for Operators
			if ( ['+', '-', '*', '/', '='].includes(char) ) {
				let type = 'operator';
				let value = '';
				if (char === '+') value = 'plus';
				else if (char === '-') value = 'minus';
				else if (char === '*') value = 'mult';
				else if (char === '/') value = 'div';
				else if (char === '=') value = 'equal';
				
				info.tokens.push({ type: type, value: value });
				info.position++;
				continue;
			}

			// 3. Check for Words / Identifiers / Numbers / Strings
			// We delegate to utilities for extraction but need to handle the result carefully
			
			// We can use a temp info object to avoid messing up the main one until we decide
			const tempInfo = { prompt: info.prompt, position: info.position, eol: false };
			this.awi.utilities.extractNextParameter( tempInfo, [ '(', ')', '.', '+', '-', '*', '/', ',', ' ' ] );
			
			// If we found a string/number, add it
			if ( tempInfo.type === 'string' || tempInfo.type === 'int' || tempInfo.type === 'float' ) {
				info.tokens.push({ type: tempInfo.type, default: tempInfo.value, value: tempInfo.value });
				info.position = tempInfo.position;
				continue;
			}
			
			if ( tempInfo.type === 'word' ) {
				const word = tempInfo.value;
				const delimiter = tempInfo.delimiter;
				
				// Check for "group.token(" pattern
				if ( delimiter === '.' ) {
					// Possible group.token
					const group = word;
					const afterDotPos = tempInfo.position; // Position is after delimiter
					
					const tokenInfo = { prompt: info.prompt, position: afterDotPos, eol: false };
					this.awi.utilities.extractNextParameter( tokenInfo, [ '(' ] );
					
					// console.log(`[PARSER-DEBUG] Dot found. Group='${group}'. Next param: value='${tokenInfo.value}', type='${tokenInfo.type}', delimiter='${tokenInfo.delimiter}'`);

					if ( tokenInfo.type === 'word' && tokenInfo.delimiter === '(' ) {
						const tokenName = tokenInfo.value.trim();
						
						// Check if valid bubble
						let bubbleName = tokenName;
						let bubbleClass = null;

						// DEBUG: Log bubble lookup
						// console.log(`[PARSER-DEBUG] Looking up bubble: group='${group}', token='${tokenName}'`);

						// 1. Exact match
						if ( this.awi.bubbleGroups[ group ] && this.awi.bubbleGroups[ group ][ bubbleName ] ) {
							bubbleClass = this.awi.bubbleGroups[ group ][ bubbleName ];
						} 
						// 2. Snake_case conversion (setVerbosity -> set_verbosity)
						else {
							const snake = bubbleName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
							if ( this.awi.bubbleGroups[ group ] && this.awi.bubbleGroups[ group ][ snake ] ) {
								bubbleName = snake;
								bubbleClass = this.awi.bubbleGroups[ group ][ snake ];
							}
							// 3. Case insensitive search (SetVerbosity -> set_verbosity)
							else if ( this.awi.bubbleGroups[ group ] ) {
								const lower = bubbleName.toLowerCase();
								const snakeLower = snake.toLowerCase();
								for ( const key in this.awi.bubbleGroups[ group ] ) {
									if ( key.toLowerCase() === lower || key.toLowerCase() === snakeLower ) {
										bubbleName = key;
										bubbleClass = this.awi.bubbleGroups[ group ][ key ];
										break;
									}
								}
							}
						}

						if ( !bubbleClass && this.awi.bubbleGroups[ group ] ) {
							// console.log(`[PARSER-DEBUG] Bubble NOT found. Available in '${group}': ${Object.keys(this.awi.bubbleGroups[group]).join(', ')}`);
						}

						if ( bubbleClass ) {
							const bubble = bubbleClass;
							
							// Parse Arguments
							// Arguments are inside ( ... )
							const argsStart = tokenInfo.position;
							let argsEnd = -1;
							
							// Find matching closing paren for arguments
							let argDepth = 1;
							let argScan = argsStart;
							while( argScan < len ) {
								const c = info.prompt.charAt(argScan);
								if ( c === '(' ) argDepth++;
								else if ( c === ')' ) argDepth--;
								
								if ( argDepth === 0 ) {
									argsEnd = argScan;
									break;
								}
								argScan++;
							}
							
							if ( argsEnd === -1 ) {
								return this.newError({ message: 'awi:syntax-error-missing-bracket', data: 'Missing closing bracket for arguments' });
							}
							
							const argsContent = info.prompt.substring( argsStart, argsEnd );
							// We need to split args by comma, respecting brackets/quotes
							// Simple strategy: recurse tokenizer on the whole args string? 
							// No, that would produce a sequence of tokens. We need to map them to parameters.
							
							const inputs = bubble.properties.inputs;
							const parameters = {};
							
							// Split args content by comma (top-level only)
							const argStrings = this.splitArguments( argsContent );
							
							for ( let i=0; i<Math.min(argStrings.length, inputs.length); i++ ) {
								const argStr = argStrings[i];
								const argTokens = [];
								const r = this.tokeniseExpression({ prompt: argStr, position: 0, tokens: argTokens });
								if (r.isError()) return r;
								parameters[ inputs[i].name ] = argTokens;
							}
							
							info.tokens.push({
								type: 'bubble',
								token: bubbleName,
								group: group,
								config: {},
								parameters: parameters
							});
							
							info.position = argsEnd + 1; // After ')'
							continue;
						}
					}
				}
				
				// Check for "token(" pattern (implicit group 'awi')
				if ( delimiter === '(' ) {
					const tokenName = word;
					const group = 'awi';
					
					let bubbleName = tokenName;
					let bubbleClass = null;

					// 1. Exact match
					if ( this.awi.bubbleGroups[ group ] && this.awi.bubbleGroups[ group ][ bubbleName ] ) {
						bubbleClass = this.awi.bubbleGroups[ group ][ bubbleName ];
					}
					// 2. Snake_case / Case-insensitive resolution
					else {
						const snake = bubbleName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
						if ( this.awi.bubbleGroups[ group ] && this.awi.bubbleGroups[ group ][ snake ] ) {
							bubbleName = snake;
							bubbleClass = this.awi.bubbleGroups[ group ][ snake ];
						}
						else if ( this.awi.bubbleGroups[ group ] ) {
							const lower = bubbleName.toLowerCase();
							const snakeLower = snake.toLowerCase();
							for ( const key in this.awi.bubbleGroups[ group ] ) {
								if ( key.toLowerCase() === lower || key.toLowerCase() === snakeLower ) {
									bubbleName = key;
									bubbleClass = this.awi.bubbleGroups[ group ][ key ];
									break;
								}
							}
						}
					}
					
					if ( bubbleClass ) {
						const bubble = bubbleClass;
						
						// Similar argument parsing logic
						const argsStart = tempInfo.position;
						let argsEnd = -1;
						let argDepth = 1;
						let argScan = argsStart;
						
						while( argScan < len ) {
							const c = info.prompt.charAt(argScan);
							if ( c === '(' ) argDepth++;
							else if ( c === ')' ) argDepth--;
							
							if ( argDepth === 0 ) {
								argsEnd = argScan;
								break;
							}
							argScan++;
						}
						
						if ( argsEnd === -1 ) return this.newError({ message: 'awi:syntax-error-missing-bracket', data: 'Missing closing bracket for arguments' });
						
						const argsContent = info.prompt.substring( argsStart, argsEnd );
						const inputs = bubble.properties.inputs;
						const parameters = {};
						const argStrings = this.splitArguments( argsContent );
						
						for ( let i=0; i<Math.min(argStrings.length, inputs.length); i++ ) {
							const argStr = argStrings[i];
							const argTokens = [];
							const r = this.tokeniseExpression({ prompt: argStr, position: 0, tokens: argTokens });
							if (r.isError()) return r;
							parameters[ inputs[i].name ] = argTokens;
						}
						
						info.tokens.push({
							type: 'bubble',
							token: bubbleName,
							group: group,
							config: {},
							parameters: parameters
						});
						
						info.position = argsEnd + 1;
						continue;
					}
				}
				
				// Regular word/identifier
				// If it had a delimiter that we didn't handle specifically above (like space or comma), just consume the word
				info.tokens.push({ type: 'string', value: word + (delimiter === ' ' ? ' ' : '') });
				// We advance to where the word ended. The delimiter itself might need processing?
				// extractNextParameter consumes the delimiter if it's in the list.
				// If delimiter is '.', we already checked it. 
				// If delimiter is ' ', we just consumed it.
				// If delimiter is ')', etc., we might need to back up?
				// Actually extractNextParameter updates tempInfo.position to *after* the delimiter.
				
				// Re-eval: simpler to just accept the word.
				// If delimiter was special (like +), we should perhaps not consume it?
				// But we passed [..., '+', ...] to extractNextParameter.
				// So `word+` -> word="word", delimiter="+"
				// We want to process `+` in next iteration. 
				// BUT tempInfo.position is AFTER `+`.
				// We need to set info.position to *before* delimiter if it's important.
				// Or push the delimiter as operator?
				
				// Refined logic:
				// If delimiter is an operator or bracket, we should probably backtrack so the main loop handles it?
				// OR just handle it here.
				
				// Let's rely on `info.position` update.
				// If we consumed a word, `tempInfo.position` is after the word and its delimiter.
				// If the delimiter was `.` (and not a bubble call), we treat `word.` as `word` token?
				// Or `word` token then `.` token?
				// The previous code seemed loose.
				
				// Let's just create a string token for the word.
				// And set position to BEFORE the delimiter if it's special?
				// `extractNextParameter` behavior:
				// It scans until it hits a char in `delimiters`.
				// It sets `info.delimiter` to that char.
				// It increments `info.position` past that char.
				
				// So if we have `word+`, `value`="word", `delimiter`="+", `position` is after `+`.
				// We want `+` to be handled as operator.
				// So we should use `tempInfo.position - 1` ?
				info.tokens.push({ type: 'string', value: word });
				
				// Backtrack to let main loop handle the delimiter if it's special
				if ( ['(', ')', '+', '-', '*', '/', '='].includes(delimiter) ) {
					info.position = tempInfo.position - 1;
				} else {
					info.position = tempInfo.position;
				}
				continue;
			}
			
			// If we got here, we didn't match anything expected or extractNextParameter failed to advance?
			// Force advance to avoid infinite loop
			if ( info.position === start ) {
				info.position++;
			}
		}
		
		return this.newAnswer( { prompt: info.prompt, tokens: info.tokens }, 'awi:answer' );
	}

	splitArguments( argsStr ) {
		const args = [];
		let current = '';
		let depth = 0;
		let inQuote = false;
		
		for ( let i=0; i<argsStr.length; i++ ) {
			const c = argsStr.charAt(i);
			if ( c === '"' || c === "'" ) {
				inQuote = !inQuote;
			}
			
			if ( !inQuote ) {
				if ( c === '(' || c === '{' || c === '[' ) depth++;
				else if ( c === ')' || c === '}' || c === ']' ) depth--;
				
				if ( c === ',' && depth === 0 ) {
					args.push( current.trim() );
					current = '';
					continue;
				}
			}
			current += c;
		}
		if ( current.trim() ) args.push( current.trim() );
		return args;
	}
}
