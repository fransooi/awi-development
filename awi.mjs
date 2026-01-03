/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_] \     
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file awi.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Main class
*/
import Base from './base.mjs'
import ConnectorRoot from './connectors/system/connectorroot.mjs'

export default class Awi extends Base
{
	constructor( awi, config )
	{
		super( awi, config );
		this.className = 'Awi';
		this.version = '0.5';
		this.hostAwi = config.hostAwi;
		this.connectors = {};
		this.bubbles = {};
		this.souvenirs = {};
		this.memories = {};
		this.classes =
		{
			connectors: {},
			bubbles: {},
			souvenirs: {},
			memories: {}
		}
		this.delayedConnectors = {};
		this.directRemembering = [];
		this.indirectRemembering = [];
    this.debug = true;
    this.logFilter = config.logFilter || 'info success warning error';
    this.userVerbosity = config.userVerbosity || 1;
    this.projectPrefix = config.projectPrefix || 'TOCOMPLETE_';
    this.projectName = config.projectName || 'Awi';
	}
	async connect( options = {} )
	{
		var self = this;
		var idCheck = {};
		var count = 0;
		this.log( '--- Awi ' + this.version + ' ---', { level: 'info' } );
		async function createElements( type, group, name, config = {}, options = {} )
		{
			if ( type == 'connectors' )
			{
				if ( options.delayed )
				{
					self.log( 'Delaying connector ' + name, { level: 'info' } );
					self.delayedConnectors[ name ] = { name: 'connectors/' + group + '/' + name, config: config, options: options };
					return;
				}
				await self.installConnector( { name: 'connectors/' + group + '/' + name, config: config, options: options } );
			}
			else
				await createBubbles( type, group, name, config, options );
		}
		async function createBubbles( type, group, name, config = {}, options = {} )
		{
			if ( !self[ type ][ group ] )
			{
				self.classes[ type ][ group ] = {};
				//await createBubble( type, group, 'error', element.config, element.options );
				//await createBubble( type, group, 'root', element.config, element.options );
			}
			// A filter?
			if ( name.indexOf( '*' ) >= 0 || name.indexOf( '?' ) >= 0 )
			{
				var path = options.modulePath ? options.modulePath : (self.system.getEnginePath() + '/' + type + '/' + group);
				var answer = await self.files.getDirectory( path, { filters: name + '.mjs', listFiles: true, recursive: false, sorted: true } );
				if ( answer.isSuccess() )
				{
					var fileList = answer.getValue();
					for ( var f = 0; f < fileList.length; f++ )
					{
						var fileOptions = Object.assign( {}, options );
						if ( options.modulePath )
							fileOptions.modulePath = path + '/' + fileList[ f ].name;
						await createBubble( type, group, self.system.basename( fileList[ f ].name, '.mjs' ), config, fileOptions );
					}
				}
			}
			else
			{
				await createBubble( type, group, name, config, options );
			}
		}
		async function createBubble( type, group, name, config = {}, options = {} )
		{
			config.key = self.utilities.getUniqueIdentifier( idCheck, group + '_' + name, '', count++ );
			idCheck[ config.key ] = true;
			var text = type + '-' + group + '-' + name;
			self.log( 'Loading ' + text, { level: 'info' } );
			var importPath = options.modulePath ? options.modulePath : ('./' + type + '/' + group + '/' + name + '.mjs');
			var exports = await import( importPath );
			var newClass = new exports.Bubble( self, config );
			if ( newClass )
			{
				self.classes[ type ][ group ][ name ] = exports;
				if ( newClass.token )
					self.classes[ type ][ group ][ newClass.token ] = exports;
				self[ type ][ config.key ] = newClass;
				if ( newClass.connect )
					await newClass.connect( self, options );
			}
		}
		// Create the elements
		for ( var c = 0; c < this.config.elements.length; c++ )
		{
			var element = this.config.elements[ c ];
			var words = element.name.split( '/' );
			var type = words[ 0 ];
			var group = words[ 1 ];
			var name = words[ 2 ];
			await createElements( type, group, name, element.config, element.options );
		}
		// Make the sorted list of connectors
		var errorConnectors = [];
		this.updateConnectorList(errorConnectors);

		// Make list of bubbles
		this.bubbleList = [];
		this.bubbleGroups = {};
		for ( var b in this.bubbles )
		{
			var bubble = this.bubbles[ b ];
			bubble.listIndex = this.bubbleList.length;
			this.bubbleList.push( this.bubbles[ b ] );
			if ( !this.bubbleGroups[ bubble.group ] )
				this.bubbleGroups[ bubble.group ] = {};
			this.bubbleGroups[ bubble.group ][ bubble.token ] = bubble;
		}
		// Connect editors
		if ( this.editor && this.editor.connected )
			this.editor.connectEditors();
		// Is everyone connected?
		var answer;
		var prompt = [];
		var text = [];
		prompt.push( '<BR>' );
		prompt.push( 'The Awi-Engine version ' + this.version );
		prompt.push( 'By Francois Lionet (c) 2024 - Open source.' );
		prompt.push( 'http://francoislio.net' );
		prompt.push( '<BR>' );
		this.connected = errorConnectors.length == 0;
		for ( var d = 0; d < this.connectorList.length; d++ )
		{
			var connectAnswer = this.connectorList[ d ].connectAnswer;
			if ( !connectAnswer )
				this.connected = false;
			else if ( connectAnswer.isError() )
			{
				this.connected = false;
				errorConnectors.push( this.connectorList[ d ].connectAnswer.data );	
			}
		}
		if ( this.connected )
		{
			this.configuration.setVerbose( this.userVerbosity );
      if ( this.http )
				await this.http.printStartupBanner();
			prompt.push( 'Ready.' );
			answer = this.newAnswer( '', { message: 'Ready.', level: 'success info', functionName: 'connect' } );
		}
		else
		{
			for ( var e = 0; e < errorConnectors.length; e++ )
			{
				var message = 'connector: ' + errorConnectors[ e ].message;
				this.log( message, { className: errorConnectors[ e ].name, group: errorConnectors[ e ].group, level: 'error' } );
			}
			answer = this.newError( { message: 'Initialization failed.' }, { stack: new Error().stack } )
		}
		return answer;
	}
	async installConnector( { name, config = {}, options = {} } )
	{
		var words = name.split( '/' );
		var type = words[ 0 ];
		var group = words[ 1 ];
		var n = words[ 2 ];
		var text = 'connector-' + group + '-' + n;
		this.log( 'Loading ' + text, { level: 'info' } );
		try
		{
			var importPath = options.modulePath ? options.modulePath : ('./connectors/' + group + '/' + n + '.mjs');
			var exports = await import( importPath );
			var newClass = new exports.Connector( this, config );
			if ( newClass )
			{
				this.connectors[ group + '-' + newClass.token ] = newClass;
				this.classes.connectors[ group ] = this.classes.connectors[ group ] ? this.classes.connectors[ group ] : {};
				this.classes.connectors[ group ][ n ] = exports;
				this[ newClass.token ] = newClass;
				await newClass.connect( options );
				this.updateConnectorList();
				return this.newAnswer( newClass );
			}
		}
		catch ( error )
		{
			this.connectors[ group + '-' + n ] = {
				loadError: true,
				name: n,
				token: n,
				group: group,
				message: error.message || 'Cannot load connector.'
			};
			return this.newError( { message: 'Cannot load connector' }, { stack: new Error().stack } );
		}
	}
	updateConnectorList(errorConnectors)
	{
		this.connectorList = [];
		for ( var c in this.connectors )
		{
			var connector = this.connectors[ c ];
			if ( connector.connected )
				this.connectorList.push( connector );
			else 
			{
				if ( connector.loadError )
				{
					if ( errorConnectors ) errorConnectors.push( connector );
				}
				else
					this.connectorList.push( connector );
			}
		}
		this.connectorList.sort( function( connector1, connector2 )
		{
			if ( connector1.priority == connector2.priority )
				return 0;
			if ( connector1.priority > connector2.priority )
				return -1;
			return 1;
		} );
	}
	getArgs( names = [], args = [], basket = {}, defaults = [] )
	{
		var result = {};
		var argsObject = {};
		if ( typeof names == 'string' )
			names = [ names ];
		if ( this.utilities.isObject( args ) )
			argsObject = args;
		for ( var n = 0; n < names.length; n++ )
		{
			var name = names[ n ];
			var value = defaults[ n ];
			if ( args.length > n )
				value = args[ n ];
			else if ( typeof argsObject[ name ] != 'undefined' )
				value = argsObject[ name ];
			else if ( typeof basket[ name ] != 'undefined' )
				value = basket[ name ];
			result[ name ] = value;
		}
		return result;
	}
	getConnector( token )
	{
		if ( this[ token ] )
			return this[ token ];
		if ( this.awi && this.awi !== this )
			return this.awi.getConnector( token );
		return null;
	}
	getConnectorByToken( token )
	{
		return this.getConnector( token );
	}
	async callParentConnector( name, functionName, argsIn )
	{
		var awi = this;
		while ( awi.awi )
		{
			var awi = awi.awi;
			if ( awi[ name ] && awi[ name ][ functionName ] )
				return await awi[ name ][ functionName ]( argsIn );
		}
		return this.newError( { message: 'awi:connector-not-found', data: name }, { stack: new Error().stack } );
	}
	async callConnectors( argsIn = {}, basket = {}, control )
	{
		var errors = [], error, answer = {};
		var { token, group, args } = this.getArgs( [ 'token', 'group', 'args' ], argsIn, basket, [ '*', '', {} ] );
		for ( var c = 0; c < this.connectorList.length; c++ )
		{
			var connector = this.connectorList[ c ];
			if ( connector instanceof ConnectorRoot )
				continue;
			if ( ( group == '*' || connector.group == group ) )
			{
				if ( connector[ token ] )
				{
					var connectorAnswer = await connector[ token ]( args, basket, control );
					if ( connectorAnswer.isError() )
					{
						errors.push( { connector: connector, error: answer.error } );
						error = 'awi:connector-error';
					}
					else
					{
						var data = connectorAnswer.getValue();
						for ( var p in data )
						{
							args[ p ] = data[ p ];
							answer[ p ] = data[ p ];
							basket[ p ] = data[ p ];
						}
					}
				}
			}
		}
		if ( errors.length > 0 )
			return this.newError( { message: 'awi:connector-error', data: errors }, { stack: new Error().stack } );
		return this.newAnswer( answer );
	}
	async callBubbles( argsIn, basket = {}, control )
	{
		var errors = [];
		var { group, action, args } = this.getArgs( [ 'action', 'group', 'args' ], argsIn, basket, [ '*', '', [] ] );
		for ( var c = 0; c < this.bubbleList.length; c++ )
		{
			var bubble = this.bubbleList[ c ];
			if ( group == '*' || group == bubble.group )
			{
				if ( bubble[ action ] )
				{
					var answer = await bubble[ action ]( args, basket, control );
					if ( !answer.isError() )
						errors.push( { bubble: bubble[ action ], error: answer.error } );
				}
			}
		}
		if ( errors.length > 0 )
			return this.newError( { message: 'awi:bubble-error', data: errors }, { stack: new Error().stack } );
		return this.newAnswer( basket )
	}
	async executeCommands( args, basket, control )
	{
		var tokenStart = '<';
		var tokenEnd = '>';
		var toClean = [];
		var errors = [];
		var { prompt, group } = this.getArgs( [ 'prompt', 'group' ], args, basket, [ '', '*' ] );
		var info = { position: 0, prompt: prompt };
		// Scan the prompt for commands
		this.utilities.skipSpaces( info );
		while ( !info.eol )
		{
			var c = info.prompt.charAt( info.position );
			if ( this.utilities.getCharacterType( c ) == 'quote' )
				this.utilities.skipString( info );
			else
			{
				var start = info.position;
				this.utilities.extractNextParameter( info, [ ' ', '(', '\t', tokenEnd ] );
				if ( info.type == 'word' && info.value.charAt( 0 ) == tokenStart )
				{
					var token = info.value.substring( 1 );
					while ( !info.eol && info.delimiter != tokenEnd )
					{
						this.utilities.extractNextParameter( info, [ ',', tokenEnd ] );
						args.push( info.value );
					}
					var errors = await this.callConnectors( [ group, token, {} ], basket, control );
					if ( errors )
						errors.push( { token: token, errors: errors } );
					toClean.push( { start: start, end: info.position } );
				}
			}
		}
		// Remove commands from prompt
		args[ 0 ] = prompt;
		if ( toClean.length > 0 )
		{
			var position = 0;
			var cleanPrompt = '';
			for ( var t = 0; t < toClean.length; t++ )
			{
				cleanPrompt += prompt.substring( position, toClean[ t ].start );
				position = toClean[ t ].end;
			}
			cleanPrompt += prompt.substring( position );
			args[ 0 ] = cleanPrompt;
		}
		if ( errors.length > 0 )
			return this.newError( { message: 'awi:connector-error', data: errors }, { stack: new Error().stack } );
		return this.newAnswer( args );
	}

	// LOGGING /////////////////////////////////////////////////////
	log( message, params)
	{
		if ( !params )
			return;

		params.source = params.source || 'awi';
		params.level = params.level || 'info';

		// If logging connector exists and Awi is fully connected, log to file
		if ( this.logging && this.logging.connected 
			&& ( ( params.source == 'awi' && params.level != 'info' )
			|| params.source == 'http' ) )
			this.logging.logDirect( message, params );

		// Output to console
		if ( this._shouldPrint(params.level, this.logFilter) )
			this._consolePrint( this._formatLog( message, params ), params );
	}
	_shouldPrint(level, logFilter)
	{
		var filterLevels = logFilter.split( ' ' );
		var levels = level.split( ' ' );
		for ( var l = 0; l < levels.length; l++ )
		{
			for ( var v = 0; v < filterLevels.length; v++ )
			{
				if ( levels[ l ] == filterLevels[ v ] )
					return true;
			}
		}
		return false;
	}
	_consolePrint( text, params )
	{
		text = text.trim();
		if (params.source === 'http')
		{
			// Server logs in italic
			if ( params.level == 'error' )
				console.log( "\x1b[31m\x1b[3m" + text + "\x1b[0m" );	// Red
			else if ( params.level == 'warning' )
				console.log( "\x1b[33m\x1b[3m" + text + "\x1b[0m" );	// Yellow
			else
				console.log( "\x1b[32m\x1b[3m" + text + "\x1b[0m" );	// Green
		}
		else
		{
			if ( params.level == 'error' )
				console.log( "\x1b[31m\x1b[1m" + text + "\x1b[0m" );	// Bright red no italic
			else if ( params.level == 'warning' )
				console.log( "\x1b[33m\x1b[1m" + text + "\x1b[0m" );	// Bright yellow no italic
			else
				console.log( "\x1b[32m\x1b[1m" + text + "\x1b[0m" );	// Bright green no italic
		}
	}
	_formatLog( message, params )
	{
		const now = new Date().toISOString();
		var lvl = ('' + (params.level || 'info')).toUpperCase().substring( 0, 7 );
		while ( lvl.length < 8 )
			lvl += ' ';
		let text = `${ now } ${ lvl }`;
		if ( params.className ) 
			text += ' ' + params.className;
		if ( params.functionName ) 
			text += '.' + params.functionName;
		if ( params.userName ) 
			text += ' ' + params.userName;
		else if ( params.userId ) 
			text += ' ' + params.userId;
		if ( params.source === 'http' )
		{
			if ( params.method ) 
				text += ' ' + params.method;
			if ( params.ip ) 
				text += ' ' + params.ip;
			if ( params.url ) 
				text += ' ' + params.url;
			if ( typeof params.statusCode !== 'undefined' ) 
				text += ' ' + params.statusCode;
			if ( typeof params.latencyMs !== 'undefined' ) 
				text += ' ' + params.latencyMs + 'ms';
			if ( typeof params.contentLength !== 'undefined' ) 
				text += ' ' + params.contentLength;
		}
		text += ' ' + message;
		return text;
	}
	alert( message, options )
	{
		console.error( message );
	}
	systemWarning( message )
	{
		console.warn( message );
		if ( this.editor && this.editor.connected )
			this.editor.print( message.split( '\n' ), { user: 'systemwarning' } );
	}
	async prompt( prompt, basket, control )
	{
		var callback = control.callback;
		var extra = control.extra;
		control.callback = null;
		control.extra = null;
		var answer = await this.prompt.prompt( prompt, basket, control );
		if ( callback )
			callback( true, answer, extra );
		return answer;
	}
	initMemory( memory )
	{
		return memory;
	}
	async save( user )
	{
		user = typeof user == 'undefined' ? this.config.user : user;
		return await this.persona.saveMemories( 'any' );
	}
}

