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
* @file refine_joke.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Generates a refined joke based on parameters
*
*/
import BubbleBase from '../../bubble.mjs'
export { BubbleRefineJoke as Bubble }

class BubbleRefineJoke extends BubbleBase
{
	constructor( awi, config = {} )
	{
		super( awi, config,
		{
			name: 'Refine Joke',
			token: 'refine_joke',
			className: 'BubbleRefineJoke',
			group: 'awi',
			version: '0.5',
			action: 'generates a refined joke',
			inputs: [ 
				{ jokeType: 'Type of joke (dad, dark, kafkayian...)', type: 'string' },
				{ subject: 'Subject of the joke', type: 'string' },
				{ humorType: 'Type of humor (english, french, american...)', type: 'string', optional: true, default: 'witty' },
				{ length: 'Length (small, medium, long)', type: 'string', default: 'medium', optional: true },
				{ words: 'Additional instructions', type: 'string', optional: true }
			],
			outputs: [ { joke: 'The generated joke', type: 'string' } ],
		} );
	}
	
	async play( args, basket, control )
	{
		await super.play( args, basket, control );

		// Helper to extract value safely
		const getValue = (param) => {
			if (!param) return null;
			if (typeof param === 'object' && param !== null) {
				return param.value || param.result || param.data || param;
			}
			return param;
		};

		var { jokeType, subject, humorType, length, words } = this.awi.getArgs( ['jokeType', 'subject', 'humorType', 'length', 'words'], args, basket, control );

		// Resolve values with defaults for empty strings
		jokeType = getValue(jokeType) || 'funny';
		subject = getValue(subject) || 'anything';
		humorType = getValue(humorType) || 'witty';
		length = getValue(length) || 'medium';
		words = getValue(words) || '';

		// Map length to tokens
		let max_tokens = 2000;
		if ( length === 'small' ) max_tokens = 1000;
		else if ( length === 'long' ) max_tokens = 4000;

		// Map words to temperature
		let temperature = 0.7;
		if ( words && words.toLowerCase().includes('creative') )
			temperature = 0.9;

		// Construct Prompt
		let prompt = `Write a ${jokeType} joke about ${subject}. The humor style should be ${humorType} humor.`;
		if ( words ) prompt += ` Additional instructions: ${words}`;

		control.editor.print( [ 'Generating joke...', `Prompt: ${prompt}`, `Temp: ${temperature}, MaxTokens: ${max_tokens}` ], { user: 'info' } );

		// Use generate directly to pass temperature and max_tokens
		var answer = await this.awi.aichat.generate({
			prompt: prompt,
			system: 'You are a professional comedian assistant.',
			temperature: temperature,
			max_tokens: max_tokens,
			saveHistory: true,
			control: control
		});

		if ( answer && answer.isError && answer.isError() )
			return answer;

		// The answer from generate is the text string (or error object if we checked isError properly)
		// But wait, generate returns either a string (text) or an error object?
		// Let's check aiedenchat.mjs again.
		// It returns this.newError(...) OR result.generated_text (string).
		
		// If it's a string, wrap it.
		if ( typeof answer === 'string' )
		{
			return this.newAnswer( answer );
		}
		
		// If it's an object (likely error if we got here and it's not string, assuming generate returns valid Answer/Error class instances on error)
		return answer;
	}
}
