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
* @file commandline.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Command line editor interface
*
*/
import EdBase from './ed-base.mjs';
import ReadLine from 'readline';
export { CommandLine as Ed }
class CommandLine extends EdBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'EdCommandLine';
		this.noInput = 0;
		this.lastLine = '';
		this.inputEnabled = true;
		this.reroute = undefined;
		this.basket = {};
		this.handle = 'commandline';

		this.readLine = ReadLine.createInterface(
		{
			input: process.stdin,
			output: process.stdout,
		} );

		// Propagate SIGINT (Ctrl+C) to process to trigger graceful shutdown
		this.readLine.on( 'SIGINT', () => {
			process.emit( 'SIGINT' );
		});

		var self = this;
		this.readLine.on( 'line', async function( prompt )
		{
			// DEBUG LOGGING - Raw console log to bypass any potential print filtering
			console.log(`[CMD-RAW] Line event: '${prompt}'`);

			// DEBUG LOGGING
			if (self.awi && self.awi.configuration && self.awi.configuration.getPrompt) {
				// Only log if verbose >= 4 to avoid noise
				// Using raw process.stdout to ensure we see it if print fails or filters
				// console.log(`[CMD-DEBUG] Line received: '${prompt}', noInput: ${self.noInput}, reroute: ${!!self.reroute}`);
			}

			if ( self.noInput == 0 )
			{
				self.lastLine = '';
				self.lastPrompt = false;
				prompt = prompt.trim();
				
				// DEBUG LOGGING 2
				self.print(`[CMD-DEBUG] Processing line: '${prompt}', reroute: ${!!self.reroute}`, { user: 'debug1', verbose: 4 });

				var basket = self.awi.configuration.getBasket( 'user' );
				if ( !basket )
					basket = self.basket;

				// Allow empty prompt (e.g. for default values in Input bubble)
				// if ( prompt != '' ) 
				{
					var answer;
					if ( self.reroute )
						answer = await self.reroute( { prompt: prompt }, basket, { editor: self } );
					else
						if ( prompt != '' ) // Only check for empty in normal command mode to avoid spamming prompt
							answer = await self.awi.prompt.prompt( [ prompt ], basket, { editor: self } );
						else
						{
							// Just re-display prompt
							self.print( '', { user: 'awi', newLine: true } );
							self.waitForInput();
							return;
						}
					
					var result = answer.getValue();
					if ( result && typeof result === 'object' )
						self.awi.configuration.setBasket( 'user', result );
				}
			}
		} );
		this.readLine.prompt( true );
	}
	waitForInput( options = {} )
	{
		super.waitForInput( options );
		if ( this.prompt )
		{
			this.lastLine = this.prompt;
			this.lastPrompt = true;
			this.readLine.setPrompt( this.prompt );
			this.readLine.prompt();
		}
	}
	close()
	{
		this.readLine.close();
	}
	print( text, options = {} )
	{
		if ( !super.print( text, options ) )
			return false;

		// this.noInput++; // No longer needed as we aren't writing to input stream
		for ( var l = 0; l < this.toPrint.length; l++ )
		{
			process.stdout.write( this.toPrint[ l ] );
			process.stdout.write( '\x1b[0m' ); // Reset color
		}
		// this.noInput--;
		this.toPrint = [];
		this.toPrintClean = [];
		return true;
	}
}
