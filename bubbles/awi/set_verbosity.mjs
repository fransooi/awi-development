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
* @file set_verbosity.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Sets the output verbosity level
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleSetVerbosity as Bubble }

class BubbleSetVerbosity extends BubbleBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.name = 'Set Verbosity';
		this.token = 'set_verbosity';
		this.className = 'BubbleSetVerbosity';
		this.group = 'awi';
		this.version = '0.5';
    if ( typeof awi.recursionCount === 'undefined' ) 
      awi.recursionCount = 0;
    else
      awi.recursionCount++;
		this.properties = {
			action: 'Sets the logging verbosity level. Use this to change how much information is printed.',
			inputs: [
				{ name: 'level', type: 'number', description: 'Target verbosity level (1=Normal, 2=Verbose, 3=Ultra, 4=Debug)', default: 1 }
			]
		};
	}

	async play( inputs, basket, control )
	{
    if ( this.awi.recursionCount > 5 ) {
      console.log( '.(**) [PARSER-TRAP] Infinite Recursion Detected (>5)! Exiting...' );
      console.trace();
      process.exit( 1 );
    }
		var { level } = this.awi.getArgs( ['level'], inputs, basket, [ 1 ] );

		// Unwrap Answer object if present
		if ( level && typeof level.getValue == 'function' )
			level = level.getValue();

		// Normalize level
		if ( typeof level === 'string' ) level = parseInt( level );
		if ( isNaN( level ) ) level = 1;
		
		// Clamp to 1-4
		level = Math.max( 1, Math.min( 4, level ) );

		if ( this.awi.configuration )
		{
			this.awi.configuration.setVerbose( level );
			await this.awi.configuration.saveConfigs();
			
			// Feedback based on level
			let msg = 'Verbosity set to ' + level + ': Normal (Conversation)';
			if ( level == 2 ) msg = 'Verbosity set to ' + level + ': Verbose (Info & Bubbles)';
			if ( level == 3 ) msg = 'Verbosity set to ' + level + ': Ultra-verbose (Warnings & Errors)';
			if ( level == 4 ) msg = 'Verbosity set to ' + level + ': Debug (All)';

			control.editor.print( msg, { user: 'awi', verbose: 4 } );
			return this.newAnswer( { level: level } );
		}

		return this.newError( { message: 'awi:connector-not-found', data: 'configuration' } );
	}
}
