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
* @file bubble-generic-quit.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Quit: save conversations and memories and quits Awi.
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleQuit as Bubble }

class BubbleQuit extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Quit',
			token: 'quit',
			className: 'BubbleQuit',
			group: 'awi',
			version: '0.5',
			action: 'save conversations and memories and quits Awi',
			inputs: [ ],
			outputs: [ ],
			parser: { verb: [ 'quit', 'leave', 'exit' ] },
			select: [ [ 'verb' ] ]
		} );
	}
	async play( args, basket, control )
	{
		await super.play( args, basket, control );
		control.editor.print( 'Saving configuration and memories...', { user: 'awi', verbose: 4 } );
		await this.awi.configuration.saveConfigs( this.awi.configuration.user );
		var answer = await this.awi.save( this.awi.configuration.user );
		
		if ( !answer.isSuccess() )
		{
			control.editor.print( 'Warning: Cannot save memories and conversations. (' + answer.message + ')', { user: 'warning', verbose: 4 } );
		}

		// Gracefully close servers to release ports
		control.editor.print( 'Closing network connections...', { user: 'awi', verbose: 4 } );
		
		const closePromises = [];

		// Close HTTP Server
			if ( this.awi.http )
			{
				if ( this.awi.http.httpServer )
				{
					closePromises.push( new Promise( resolve => {
						this.awi.http.httpServer.close( (err) => {
							if (err) console.error('Error closing HTTP server:', err);
							resolve();
						});
					}));
				}
				if ( this.awi.http.httpsServer )
				{
					closePromises.push( new Promise( resolve => {
						this.awi.http.httpsServer.close( (err) => {
							if (err) console.error('Error closing HTTPS server:', err);
							resolve();
						});
					}));
				}
			}

			// Close WebSocket Server
			if ( this.awi.websocket && this.awi.websocket.wsServer )
			{
				closePromises.push( new Promise( resolve => {
					this.awi.websocket.wsServer.close( (err) => {
						if (err) console.error('Error closing WebSocket server:', err);
						resolve();
					});
					// Also forcefully close any client connections if needed, 
					// but wsServer.close() usually prevents new connections.
					// Existing clients might stay alive, so we iterate and terminate.
					if (this.awi.websocket.wsServer.clients) {
						for (const client of this.awi.websocket.wsServer.clients) {
							client.terminate();
						}
					}
				}));
			}

			if ( closePromises.length > 0 )
			{
				await Promise.all( closePromises );
				// Give a small buffer for OS to reclaim ports
				await new Promise( resolve => setTimeout( resolve, 500 ) );
			}

		this.awi.system.quit();
		
		return answer;
	}
	async playback( args, basket, control )
	{
		return await super.playback( args, basket, control );
	}
}

