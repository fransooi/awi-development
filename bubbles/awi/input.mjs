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
* @file bubble-input.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Input command: input missing parameters
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleInput as Bubble }

class BubbleInput extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Input',
			token: 'input',
			className: 'BubbleInput',
			group: 'awi',
			version: '0.5',
			action: 'ask the user for input',
			inputs: [ { inputInfo: 'information on the data to input', type: 'array' } ],
			outputs: []
		} );
	}
	async play( args, basket, control )
	{
		await super.play( args, basket, control );
		if ( !args.inputInfo )
			return { error: 'awi:cancelled' };

		var self = this;
		var result;
		var firstResult;
		var firstType = '';
		var inputInfo = args.inputInfo.data;
		var type = inputInfo.type;
		var dot = type.indexOf( '.' );
		if ( dot > 0 )
		{
			firstType = type.substring( 0, dot );
			type = type.substring( dot + 1 );
			if ( firstType == 'array' )
				firstResult = [];
		}
		this.properties.outputs[ 0 ] = inputInfo;

		var text;
		var description = inputInfo.description;
		switch ( firstType )
		{
			case 'array':
				text = 'Please enter, prompt by prompt, ' + description + '.\nPress <return> to exit...';
				break;
			case 'choices':
				text = description + '\n';
				for ( var c = 0; c < inputInfo.choices.length; c++ )
				{
					var t = inputInfo.choices[ c ];
					if ( t == inputInfo.default )
						t += ' (default)';
					text += ' ' + ( c + 1 ) + '. ' + t + '\n';
				}
				text += 'Or press <return> for default.';
				break;
			case 'yesno':
				text = description + '?';
				break;
			default:
				text = 'Please enter ' + description + '?'
				break;
		}
		control.editor.print( text.split( '\n' ), { user: 'question', newLine: true, space: true } );

		var self = this;
		var finished = false;
		var resultAnswer = {};
		control.editor.rerouteInput(
			function( args )
			{
				control.editor.print('DEBUG: Input received: "' + (args && args.prompt ? args.prompt : 'undefined') + '"', { user: 'debug1', verbose: 4 });
				var start = 0;
				var { prompt } = self.awi.getArgs( [ 'prompt' ], args, {}, [ '' ] );
				var c = self.awi.utilities.getCharacterType( prompt.charAt( start ) );
				while( c != 'letter' && c != 'number' && start < prompt.length )
				{
					start++;
					c = self.awi.utilities.getCharacterType( prompt.charAt( start ) );
				}
				prompt = prompt.substring( start );
				if ( prompt == '' )
				{
					result = '<___cancel___>';
				}
				else
				{
					if ( type == 'number' )
					{
						var number = parseInt( prompt );
						if ( !isNaN( number ) )
						{
							var interval = inputInfo.interval;
							if ( interval )
							{
								if ( number < interval.start || number < interval.end )
								{
									self.awi.editor.print( [ 'Please enter a number between ' + interval.start + ' and ' + interval.end + '...' ], { user: 'information' } );
									return;
								}
							}
							result = number;
						}
					}
					else
					{
						result = prompt;
					}
				}
				if ( result != '<___cancel___>' )
				{
					var prompt = self.awi.configuration.getPrompt( 'question' );
					switch ( firstType )
					{
						case 'array':
							var dot = result.indexOf( '.' );
							if ( dot >= 0 && dot < 8 )
								result = result.substring( dot + 1 ).trim();
							if ( result.length == '' )
							{
								result = firstResult;
								break;
							}
							firstResult.push( result );
							
							// Update prompt for next item
							var nextPrompt = prompt + (firstResult.length + 1) + '. ';
							control.editor.setPrompt( nextPrompt );
							
							control.editor.waitForInput( { force: true } );
							return;
						case 'choices':
							result = parseInt( result );
							var found;
							if ( !isNaN( result ) && result >= 0 && result <= inputInfo.choices.length )
								found = inputInfo.choices[ result - 1 ];
							if ( !found )
							{
								text.push(  + inputInfo.default + '.' );
								control.editor.print( 'Please enter a number between 1 and ' + inputInfo.choices.length, { user: 'awi' } );
								control.editor.waitForInput( { force: true } );
								return;
							}
							else
							{
								result = found;
							}
							break;
						case 'yesno':
							if ( result == '<___cancel___>' )
							{
								result = inputInfo.default;
							}
							else
							{
								if ( result.charAt( 0 ).toLowerCase() == 'y' )
									result = 'yes';
								else
								{
									text.push( 'Please answer yes or no...' );
									control.editor.print( text, { user: 'awi' } );
									control.editor.waitForInput( { force: true } );
									return;
								}
							}
							break;
					}
				}
				else
				{
					switch ( firstType )
					{
						case 'array':
							result = firstResult;
							break;
						case 'choices':
						case 'yesno':
							result = inputInfo.default;
							break;
						default:
							// Handle standard types (string, number, etc.) default/optional
							if ( inputInfo.default !== undefined )
								result = inputInfo.default;
							else if ( inputInfo.optional )
								result = ""; // Empty string for optional
							break;
					}
				}
				control.editor.rerouteInput();
				finished = true;
				resultAnswer[ inputInfo.name ] = result;
				return self.newAnswer( resultAnswer );
			} );

		var prompt = this.awi.configuration.getPrompt( 'question' );
		if ( firstType == 'array' )
			prompt += '1. ';
		control.editor.setPrompt( prompt );
		control.editor.waitForInput();
		return new Promise( ( resolve ) =>
		{
			const checkPaused = () =>
			{
				var handle = setInterval(
					function()
					{
						if ( finished )
						{
							clearInterval( handle );
							if ( result == '<___cancel___>' )
								resolve( self.newError( { message: 'awi:cancelled' } ) );
							else
								resolve( self.newAnswer( result ) );
						}
					}, 10 );
			};
			checkPaused();
		} );
	}
	async playback( args, basket, control )
	{
		return await super.playback( args, basket, control );
	}
}

