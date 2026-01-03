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
* @file bubble-error.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Error management bubble
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleError as Bubble }

class BubbleError extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Error',
			token: 'error',
			className: 'BubbleError',
			group: 'awi',
			version: '0.5',
			action: 'handle errors'
		} );
	}
	async play( args, basket, control )
	{
		await super.play( args, basket, control );
		return this.newError( { message: 'awi:nothing-to-play' }, { stack: new Error().stack } );
	}
	async playback( args, basket, control )
	{
		return await super.playback( args, basket, control );
	}
}

