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
* @file branch.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short A tree of bubbles that works as a bubble: a branch.
*
*/
import BubbleBase from './bubble.mjs'

export default class BranchBase extends BubbleBase
{
	constructor( awi, config, data )
	{
		config.errorClass = typeof config.errorClass ? config.errorClass : 'bubbles';
		super( awi, config, data );

		this.bubbleMap = {};
		this.className = 'BranchBase';
		this.name = 'branch Base';
		this.currentBubble = '';
		this.initialized = false;
		this.tokenLists = { up: [], down: [] };
		this.tokenLast = { up: 0, down: 0 };
		this.tokenPosition = { up: 0, down: 0 };
		this.tokenLength = { up: 0, down: 0 };
		this.pulseHandle = null;
		this.pulseInterval = config.pulseInterval || 100;
	}
	initTokenList( list )
	{
		this.tokenLists[ list ] = [];
		this.tokenLast[ list ] = 0;
		this.tokenLength[ list ] = 0;
		this.tokenPosition[ list ] = 0;
	}
	reset()
	{
		super.reset();
		this.initTokenList( 'up' );
		this.initTokenList( 'down' );
		this.initialized = true;
		this.stopPulse();
	}
	
	// Dataflow / Germ / Pulse
	async germ( args, basket, control )
	{
		this.reset();
		// Initial injection of data into basket
		if ( args )
		{
			for ( var a in args )
				basket[ a ] = args[ a ];
		}
		
		this.startPulse( basket, control );
		return this.newAnswer( { status: 'germinated' } );
	}

	startPulse( basket, control )
	{
		if ( this.pulseHandle )
			this.stopPulse();
			
		var self = this;
		this.pulseHandle = setInterval( async function()
		{
			await self.pulse( basket, control );
		}, this.pulseInterval );
	}

	stopPulse()
	{
		if ( this.pulseHandle )
		{
			clearInterval( this.pulseHandle );
			this.pulseHandle = null;
		}
	}

	async pulse( basket, control )
	{
		// Simulate liquid flow: explore up and down
		// In a real dataflow, this would propagate data between bubbles
		await this.explore( 'down', basket, control );
		await this.explore( 'up', basket, control );
	}

	async explore( direction, basket, control )
	{
		// Basic exploration: run tokens in the list
		// This ensures that the branch processes its bubbles
		if ( this.tokenLists[ direction ] && this.tokenLists[ direction ].length > 0 )
		{
			// We might want to track progress/state here
			// For now, just attempt to run pending logic
			// Using silent mode to avoid spamming output during pulse
			await this.runTokens( { list: direction, from: 'start', silent: true }, basket, control );
		}
	}

	async run( args, basket, control )
	{
		return await this.runTokens( args, basket, control );
	}

	async play( argsIn = [], basket = {}, control = {} )
	{
		var { command, args } = this.awi.getArgs( [ 'command', 'args' ], argsIn, basket, [ '', [] ] );
		if ( command == 'run' || !this.initialized )
			this.reset();
		return await this.run( { list: 'up', from: 'start', args: args }, basket, control );
	}
	async playback( args, basket, control )
	{
	}

	newBubble( command, options = {} )
	{
		var parent = command.parent ? command.parent : this.currentBubble;
		var parentClass = ( typeof command.parentClass == 'undefined' ? 'bubbles' : command.parentClass );
		var parameters = command.parameters ? command.parameters : {};
		parent = options.parent ? options.parent : parent;
		parentClass = ( typeof options.parentClass == 'undefined' ? parentClass : options.parentClass );
		parameters = ( typeof options.parameters == 'undefined' ? parameters : options.parameters );
		var group = ( typeof command.group == 'undefined' ? 'awi' : command.group );
		var exits = ( typeof command.exits == 'undefined' ? { success: 'end' } : command.exits );
		var key = ( command.key ? command.key : this.awi.utilities.getUniqueIdentifier( this.bubbleMap, group + '_' + command.token, '', this.keyCount++ ) );
		
		// Merge command.config into the configuration object so properties like outputs are at the top level
		var bubbleConfig = { key: key, branch: this, parent: parent, exits: exits, parameters: parameters };
		if ( command.config )
		{
			for ( var c in command.config )
				bubbleConfig[ c ] = command.config[ c ];
		}
		
		if ( !this.awi.classes[ parentClass ] || 
			 !this.awi.classes[ parentClass ][ group ] || 
			 !this.awi.classes[ parentClass ][ group ][ command.token ] ) {
			console.error( 'Branch Error: Bubble class not found for', parentClass, group, command.token );
			return this.awi.newError({ message: 'awi:bubble-not-found', data: { parentClass, group, token: command.token } });
		}

		return new this.awi.classes[ parentClass ][ group ][ command.token ].Bubble( this.awi, bubbleConfig );
	}
	addTokens( argsIn, basket, control = {} )
	{
		var { tokens, list, position } = this.awi.getArgs( [ 'tokens', 'list', 'position' ], argsIn, basket, [ '{}', 'up', 0 ] );
		this.initTokens( [ tokens, {} ], basket, control );
		this.tokenLast[ list ] = this.tokenLists[ list ].length;
		this.tokenLists[ list ] = this.tokenLists[ list ].concat( tokens );
		this.tokenLength[ list ] = this.tokenLists[ list ].length;
	}
	initTokens( argsIn, basket, control )
	{
		var { tokens, args } = this.awi.getArgs( [ 'tokens', 'args' ], argsIn, basket, [ 'root', {} ] );
		if ( typeof tokens == 'string' ) {
			if ( this.tokenLists[ tokens ] ) {
				tokens = this.tokenLists[ tokens ];
			} else {
				console.error(`[BRANCH-ERROR] initTokens: Token list '${tokens}' not found.`);
				tokens = [];
			}
		}
		if ( !Array.isArray(tokens) ) {
			console.error(`[BRANCH-ERROR] initTokens: tokens is not an array (type: ${typeof tokens})`, tokens);
			tokens = [];
		}

		for ( var n = 0; n < tokens.length; n++ )
		{
			var token = tokens[ n ];
			switch( token.type )
			{
				case 'bubble':
					token.bubble = this.newBubble( token, { parent: token } );
					for ( var p in token.parameters )
						this.initTokens( [ token.parameters[ p ], args ], basket, control );
					break;
				case 'open':
					this.initTokens( [ token.tokens, args ], basket, control );
					break;
				case 'int':
				case 'float':
				case 'number':
				case 'string':
					token.value = token.default;
					break;
				case 'object':
					break;
			}
		}
		return this.newAnswer();
	}
	async runTokens( argsIn, basket, control )
	{
		// Extract list/from arguments if present to populate tokens
		var { tokens, list, from, silent } = this.awi.getArgs( ['tokens', 'list', 'from', 'silent'], argsIn, basket, [ null, '', '', false ] );
		
		if ( !tokens && list && this.tokenLists[ list ] )
		{
			if ( from == 'start' )
				tokens = this.tokenLists[ list ];
			else if ( from == 'last' )
				tokens = this.tokenLists[ list ].slice( this.tokenLast[ list ] );
			else if ( typeof from == 'number' )
				tokens = this.tokenLists[ list ].slice( from );
			else
				tokens = this.tokenLists[ list ];
				
			// Update argsIn to pass the found tokens
			if ( Array.isArray( argsIn ) ) {
				// We can't easily modify positional array args if we don't know the structure, 
				// but getExpression looks for 'tokens' in named args too.
				// We'll construct a new object for argsIn.
				argsIn = { ...this.awi.getArgs(['args'], argsIn, basket, [{}]), tokens: tokens };
			} else {
				argsIn.tokens = tokens;
			}
		}

		var answer = await this.getExpression( argsIn, basket, control );
		if ( answer.isError() )
			control.editor.print( answer.getPrint(), { user: 'error' } );
		else if ( control.promptOn > 0 && !silent )
		{
			var text = answer.getPrint();
			if ( text )
				control.editor.print( text, { user: 'awi' } );
		}
		return answer;
	}
	async getExpression( argsIn, basket, control )
	{
		var self = this;
		var error;
		async function getValue( token )
		{
			switch( token.type )
			{
				case 'bubble':
					var argsOut = {};
					for ( var p in token.parameters )
						argsOut[ p ] = await self.getExpression( [ token.parameters[ p ], '', args ], basket, control );
					var answer = await token.bubble.play( argsOut, basket, control );
					if ( answer.isError() )
						return answer;
					if ( token.bubble.properties.outputs && token.bubble.properties.outputs.length > 0 )
					{
						var value = answer.getValue();
            // TODO: restore when verbosity fixed.
						//control.editor.print( [ "Bubble returned: " + value ], { user: 'bubble' } );
						basket[ token.bubble.properties.outputs[ 0 ].name ] = value;
						args[ token.bubble.properties.outputs[ 0 ].name ] = value;
					}
					return answer;
				case 'open':
					return await self.getExpression( [ token.tokens, args ], basket, control );
				case 'int':
				case 'float':
				case 'string':
				case 'number':
				case 'object':
					return self.newAnswer( token.value );
				case 'variable':
					var val = basket[ token.name ] !== undefined ? basket[ token.name ] : args[ token.name ];
					return self.newAnswer( val );
				case 'operator':
					return self.newAnswer( token.value, '', 'operator' );

				default:
					break;
			}
			return self.newAnswer( 0, '', 'undefined' );
		}

		var { tokens, args } = this.awi.getArgs( [ 'tokens', 'args' ], argsIn, basket, [ [], {} ] );
		if ( !tokens )
			tokens = [];
		if ( !Array.isArray( tokens ) )
			tokens = [ tokens ];
			
		var position = 0;
		var quit = false;
		var operand, operator;
		var result = self.newAnswer( 0, '', 'undefined' );
		if ( position < tokens.length )
		{
			result = await getValue( tokens[ position++ ] );
			if ( result.isError() )
				return result;
			while( position < tokens.length && !quit )
			{
				operator = await getValue( tokens[ position++ ] );
				if ( operator.type != 'operator' || operator.data == 'comma' )
				{
					// Not an operator (or is a comma), treat as sequence/separator
					if ( operator.type == 'operator' && operator.data == 'comma' )
					{
						// It's a comma, fetch next token as new result if available
						if ( position < tokens.length )
						{
							result = await getValue( tokens[ position++ ] );
							if ( result.isError() ) return result;
						}
					}
					else
					{
						// It's a value (e.g. a Bubble result), so it becomes the current result (sequential execution)
						result = operator;
					}
					// Continue to next iteration to look for operators for this new result
					continue;
				}

				if ( position >= tokens.length )
					break;
				operand = await getValue( tokens[ position++ ] );
				if ( operand.type == 'error' )
					return operand;
				switch ( operator.result )
				{
					case 'plus':
						result.data += operand.data;
						if ( operand.type == 'string' )
							result.type = 'string';
						break;
					case 'minus':
						result.data -= operand.data;
						break;
					case 'mult':
						result.data *= operand.data;
						break;
					case 'div':
						result.data /= operand.data;
						break;
					default:
						quit = true;
						break;
				}
			}
		}
		return result;
	}

	// Bubble tree handling
	findBubbleFromToken( token )
	{
		for ( var b in this.bubbleMap )
		{
			if ( this.bubbleMap[ b ].token == token )
				return this.bubbleMap[ b ];
		}
	}
	getBubble( key )
	{
		return this.bubbleMap[ key ];
	}
	getNumberOfBubbles()
	{
		var count = 0;
		for ( var b in this.bubbleMap )
			count++;
		return count - 1;
	}
	getLastBubble( exit )
	{
		exit = ( typeof exit == 'undefined' ? 'success' : exit );

		var found;
		var bubble = this.getBubbleFromToken( 'root' );
		while ( bubble )
		{
			found = bubble;
			bubble = this.getBubble( bubble.properties.exits[ exit ] );
		}
		return found;
	}
	deleteBubble( key )
	{
		if ( this.bubbleMap[ key ] )
		{
			var newBubbleMap = {};
			for ( var b in this.bubbleMap )
			{
				if ( b != key )
					newBubbleMap[ b ] = this.bubbleMap[ b ];
			}
			this.bubbleMap = newBubbleMap;
			return;
		}
		this.awi.systemWarning( 'Bubble not found!' )
	}
	findBubble( callback )
	{
		for ( var key in this.bubbleMap )
		{
			if ( callback( this.bubbleMap[ key ] ) )
			{
				return this.bubbleMap[ key ];
			}
		}
		return null;
	}
	getBubbleChain( whereFrom, distance, howMany, exit )
	{
		exit = ( typeof exit == 'undefined' ? 'success' : exit );

		var bubble;
		var result = [];
		if ( whereFrom == 'end' )
		{
			bubble = this.getLastBubble( exit );
			while( bubble && distance > 0 )
			{
				bubble = this.getBubble( bubble.parent );
				distance--;
			}
			while( bubble && howMany > 0 )
			{
				result.push( bubble );
				bubble = this.getBubble( bubble.parent );
				howMany--;
			}
		}
		else
		{
			bubble = this.getBubble( 'root' );
			while( bubble && distance > 0 )
			{
				bubble = this.getBubble( bubble.properties.exits[ exit ] );
				distance--;
			}
			while( bubble && howMany > 0 )
			{
				result.push( bubble );
				bubble = this.getBubble( bubble.properties.exits[ exit ] );
				howMany--;
			}
		}
		return result;
	}
}

