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
* @file switch_persona.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Switches the active persona
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleSwitchPersona as Bubble }

class BubbleSwitchPersona extends BubbleBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.name = 'Switch Persona';
		this.token = 'switch_persona';
		this.className = 'BubbleSwitchPersona';
		this.group = 'awi';
		this.version = '0.5';

		this.properties = {
			action: 'Switches the active persona',
			inputs: [
				{ name: 'token', type: 'string', description: 'The token of the persona to switch to (e.g., awi)' }
			]
		};
	}

	async play( inputs, basket, control )
	{
		var { token } = this.awi.getArgs( ['token'], inputs, basket, ['awi'] );

		if ( !token )
			return this.newError( { message: 'awi:missing-parameter', data: 'token' }, { stack: new Error().stack } );

		// Call the persona connector to switch
		// Assuming control.user is the current user name or we get it from config
		// The setPersona method in ConnectorPersona updates the current persona for the session/user
		
		// We can directly use the connector if available
		if ( this.awi.persona )
		{
			// The setPersona method takes args, basket, control
			// args: { token: ... }
			var result = await this.awi.persona.setPersona( { token: token }, basket, control );
			if ( result.isSuccess() )
			{
				control.editor.print( 'Switched to persona: ' + token, { user: 'awi' } );
				return this.newAnswer( { token: token } );
			}
			return result;
		}

		return this.newError( { message: 'awi:connector-not-found', data: 'persona' }, { stack: new Error().stack } );
	}
}
