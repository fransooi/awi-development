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
* @file procedure.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Procedure bubble: executes a predefined sequence of prompts
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleProcedure as Bubble }

class BubbleProcedure extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Procedure',
			token: 'procedure',
			className: 'BubbleProcedure',
			group: 'awi',
			version: '0.5',
			action: 'Executes a named sequence of prompts defined in the personality',
			inputs: [ 
				{ name: 'name', type: 'string', description: 'Name of the procedure to run' },
				{ name: 'param1', type: 'string', description: 'First parameter', optional: true },
				{ name: 'param2', type: 'string', description: 'Second parameter', optional: true },
				{ name: 'param3', type: 'string', description: 'Third parameter', optional: true },
				{ name: 'param4', type: 'string', description: 'Fourth parameter', optional: true },
				{ name: 'param5', type: 'string', description: 'Fifth parameter', optional: true }
			],
			outputs: [ { name: 'result', type: 'string', description: 'The final response from the procedure' } ],
		} );
	}

	async play( args, basket, control )
	{
		await super.play( args, basket, control );

		var { name, param1, param2, param3, param4, param5 } = this.awi.getArgs( [ 'name', 'param1', 'param2', 'param3', 'param4', 'param5' ], args, basket, [ null, null, null, null, null, null ] );
		
		if ( !name )
			return this.newError( { message: 'awi:procedure-name-missing', functionName: 'play' } );

		let procedureName = "";
		if ( typeof name.getValue === 'function' )
			procedureName = name.getValue();
		else
			procedureName = name.value || name;

		if ( !procedureName )
			return this.newError( { message: 'awi:procedure-name-empty', functionName: 'play' } );

		procedureName = procedureName.trim();

		// Helper to extract value from Answer object or primitive
		const extractVal = (p) => {
			if (!p) return "";
			if (typeof p === 'object') {
				if (typeof p.getValue === 'function') return p.getValue();
				return p.data || p.value || p.result || "";
			}
			return p;
		};

		// Extract parameter values
		const params = [
			extractVal(param1),
			extractVal(param2),
			extractVal(param3),
			extractVal(param4),
			extractVal(param5)
		];

		let persona = this.awi.configuration.getPersona( 'user' );
		
		if ( !persona || !persona.procedures || !persona.procedures[ procedureName ] )
		{
			// Fallback: The loaded persona (likely from DB) might be stale.
			// Try loading fresh from file.
			const userConfig = this.awi.configuration.getUserConfig();
			const token = userConfig && userConfig.persona ? userConfig.persona : 'awi';
			
			// We need to access the persona connector helper
			if ( this.awi.persona && this.awi.persona.loadPersonaFromFile )
			{
				const filePersona = await this.awi.persona.loadPersonaFromFile( token );
				if ( filePersona && filePersona.procedures && filePersona.procedures[ procedureName ] )
				{
					persona = filePersona;
					// Update the running config so we don't have to reload next time
					this.awi.configuration.setPersona( token, persona );
				}
			}
		}

		if ( !persona || !persona.procedures || !persona.procedures[ procedureName ] )
			return this.newError( { message: 'awi:procedure-not-found', data: procedureName, functionName: 'play' } );

		let procDef = persona.procedures[ procedureName ];
		let steps = [];

		// Handle both new object structure and old array structure
		if ( Array.isArray( procDef ) ) {
			steps = procDef;
		} else if ( procDef && Array.isArray( procDef.steps ) ) {
			steps = procDef.steps;
		}

		if ( !Array.isArray( steps ) || steps.length === 0 )
			return this.newError( { message: 'awi:procedure-empty', data: procedureName, functionName: 'play' } );

		control.editor.print( `Running procedure '${procedureName}' with ${steps.length} steps...`, { user: 'awi' } );

		// Create parameter map for named substitution
		let paramMap = {};
		if (procDef.parameters && Array.isArray(procDef.parameters)) {
			procDef.parameters.forEach((def, index) => {
				if (def.name) {
					// Use provided value or default
					let val = params[index];
					if (val === "" || val === undefined || val === null) {
						val = def.default || "";
					}
					paramMap[def.name] = val;
				}
			});
		}
		
		// Also map 1-based indices for backward compatibility
		params.forEach((val, i) => {
			paramMap[(i+1).toString()] = val;
		});

		let lastResponse = "";

		for ( let i = 0; i < steps.length; i++ )
		{
			let step = steps[ i ];
			
			// Substitute parameters using named map
			// Matches {{key}} and replaces with value from map
			step = step.replace( /\{\{([^}]+)\}\}/g, ( match, key ) => {
				key = key.trim();
				return (paramMap[key] !== undefined) ? paramMap[key] : match;
			});
			
			// Cleanup unused placeholders (optional, or leave them?)
			// Let's replace remaining {{N}} with empty string to be clean
			// step = step.replace( /\{\{\d\}\}/g, '' ).replace(/\s+/g, ' ').trim();

			// Simulate user input display
			// control.editor.print( step, { user: 'user' } ); // Optional: print what we are sending? 
			// The user asked to "display the final result", implying intermediate steps might be hidden or summary?
			// But for a conversation simulation, seeing the flow is usually good. 
			// Let's print the step as if the user typed it.
			
			// const userPrompt = this.awi.configuration.getPrompt( 'user' ) || '> ';
			// We can't easily fake the user prompt prefix perfectly without some hacks, 
			// but we can just print the line.
			control.editor.print( step, { user: 'user' } ); // Using 'user' style

			// Execute the step. 
			// Check if it's a command (starts with awi.)
			if ( step.trim().startsWith('awi.') )
			{
				const cleanStep = step.trim();
				control.editor.print( 'Executing command: ' + cleanStep, { user: 'debug1', verbose: 4 } );
				// Use the prompt connector to execute the command as if typed by user
				// We pass current basket/control
				const cmdAnswer = await this.awi.prompt.prompt( { prompt: cleanStep, recursive: true }, basket, control );

				if ( cmdAnswer.isError() )
				{
					control.editor.print( 'Procedure command failed: ' + cmdAnswer.message, { user: 'error' } );
					return cmdAnswer;
				}
				lastResponse = cmdAnswer.getValue();
			}
			else
			{
				// Assume chat prompt
				// Note: We need to pass the current basket/control context
				const answer = await this.awi.aichat.send( { prompt: step }, basket, control );
				
				if ( answer.isError() )
				{
					const errMsg = this.awi.messages.formatError ? 
						this.awi.messages.formatError({ msg: answer.message, data: answer.data }) : 
						answer.message;
					
					control.editor.print( 'Procedure step failed: ' + errMsg, { user: 'error' } );
					return answer;
				}

				lastResponse = answer.getValue();
				
				if ( i < steps.length - 1 )
					control.editor.print( lastResponse.split('\n'), { user: 'awi', newLine: true } );
			}
		}

		// Return the final result
		return this.newAnswer( lastResponse );
	}
}
