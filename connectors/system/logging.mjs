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
* @file logging.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Logging functions
*/
import pino from 'pino'
import { createStream as createRotatingStream } from 'rotating-file-stream'
import FS from 'node:fs'
import Path from 'node:path'
import readline from 'node:readline'
import { mkdirp } from 'mkdirp'
import ConnectorEditor from '../../connectoreditor.mjs'

export { ConnectorLogging as Connector }

class ConnectorLogging extends ConnectorEditor
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Logging';
		this.token = 'logging';
		this.className = 'ConnectorLogging';
		this.group = 'system';
		this.version = '0.5';

		// Directories and file names
		this.basePath = null;
		this.httpDir = null;
		this.appDir = null;
		this.httpFilename = 'http.log';
		this.appFilename = 'app.log';

		// Pino loggers
		this.httpLogger = null;
		this.appLogger = null;
	}

	// Public helpers used by Awi.log to avoid Answer recursion
	logDirect( message, params )
	{
		try
		{
			const p = params || {};
			const target = ( p.source === 'http' ) ? 'http' : 'app';
			if ( typeof p.msg === 'undefined' )
				p.msg = ( typeof message === 'string' ) ? message : ( message != null ? ( '' + message ) : '' );
			this._log( target, p );
		}
		catch( _ ) {}
	}

	formatDirect( source, parameters, verbosity )
	{
		try { return this._formatEntry( source === 'http' ? 'http' : 'app', parameters || {}, verbosity || (parameters && parameters.verbosity) || 'low' ); } catch( _ ) { return ''; }
	}
	_createDirectories( path )
	{
		try
		{
			mkdirp.sync( path );
			return true;
		}
		catch( e )
		{
			return false;
		}
	}
	async connect( options )
	{
		super.connect( options, true );

		this.basePath = options.basePath;
		if ( !this.basePath )
		{
			this.awi.log('No logs path provided', { source: 'http', level: 'error' });
			return this.setConnected(false);
		}
		this.httpDir = Path.join( this.basePath, 'http' );
		this.appDir = Path.join( this.basePath, 'app' );
		if ( !this._createDirectories( this.httpDir ) )
		{
			this.awi.log('Cannot create logs path', { source: 'http', level: 'error' });
			return this.setConnected(false);
		}
		if ( !this._createDirectories( this.appDir ) )
		{
			this.awi.log('Cannot create logs path', { source: 'http', level: 'error' });
			return this.setConnected(false);
		}

		let httpStream, appStream;
		try
		{
			httpStream = createRotatingStream( this.httpFilename, { interval: '1d', path: this.httpDir, compress: false } );
			appStream = createRotatingStream( this.appFilename, { interval: '1d', path: this.appDir, compress: false } );
		}
		catch( e )
		{
			// Fallback to direct file destinations if rotating-file-stream is not available
			httpStream = FS.createWriteStream( Path.join( this.httpDir, this.httpFilename ), { flags: 'a' } );
			appStream = FS.createWriteStream( Path.join( this.appDir, this.appFilename ), { flags: 'a' } );
		}

		// Create Pino instances with maximum verbosity; filtering is handled by callers
		this.httpLogger = pino( { level: 'trace' }, httpStream );
		this.appLogger = pino( { level: 'trace' }, appStream );

		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.logHttp = this.command_logHttp.bind(this);
		info[ this.token ].commands.logApp = this.command_logApp.bind(this);
		info[ this.token ].commands.formatLog = this.command_formatLog.bind(this);
		return this.newAnswer( info );
	}
	// Map verbosity to Pino level name
	_mapVerbosityToLevel( verbosity )
	{
		if ( !verbosity ) return 'info';
		switch ( ('' + verbosity).toLowerCase() )
		{
			case 'high': return 'trace';
			case 'medium': return 'debug';
			case 'low':
			default: return 'info';
		}
	}

	_normalizeLevel( level, verbosity )
	{
		const s = ( '' + ( level || '' ) ).toLowerCase();
		if ( s.indexOf( 'error' ) >= 0 ) return 'error';
		if ( s.indexOf( 'warning' ) >= 0 || s.indexOf( 'warn' ) >= 0 ) return 'warn';
		if ( s.indexOf( 'success' ) >= 0 || s.indexOf( 'info' ) >= 0 ) return 'info';
		if ( s.indexOf( 'debug' ) >= 0 ) return 'debug';
		if ( s.indexOf( 'trace' ) >= 0 ) return 'trace';
		return this._mapVerbosityToLevel( verbosity );
	}

	_levelThresholdForVerbosity( verbosity )
	{
		// Pino levels: trace(10), debug(20), info(30), warn(40), error(50), fatal(60)
		switch ( ('' + (verbosity || 'low')).toLowerCase() )
		{
			case 'high': return 10;
			case 'medium': return 20;
			case 'low':
			default: return 30;
		}
	}

	_levelNameFromValue( levelNumber )
	{
		// Align with Pino numeric levels
		if ( levelNumber <= 10 ) return 'TRACE';
		if ( levelNumber <= 20 ) return 'DEBUG';
		if ( levelNumber <= 30 ) return 'INFO';
		if ( levelNumber <= 40 ) return 'WARN';
		if ( levelNumber <= 50 ) return 'ERROR';
		return 'FATAL';
	}

	_formatTimestamp( epochMs )
	{
		try { return new Date( epochMs || Date.now() ).toISOString(); } catch( _ ) { return '' + epochMs; }
	}

	_shouldPrint( verbosity, levelNumber )
	{
		const min = this._levelThresholdForVerbosity( verbosity );
		return ( typeof levelNumber !== 'number' ) ? true : ( levelNumber >= min || levelNumber >= 50 );
	}

	_formatCommon( obj )
	{
		let parts = [];
		if ( obj.requestId ) parts.push( 'reqId=' + obj.requestId );
		if ( obj.userName ) parts.push( 'user=' + obj.userName );
		else if ( obj.userId ) parts.push( 'userId=' + obj.userId );
		return parts.join( ' ' );
	}

	_formatHttp( obj )
	{
		let parts = [];
		if ( obj.method ) parts.push( obj.method );
		if ( obj.url ) parts.push( obj.url );
		if ( typeof obj.statusCode !== 'undefined' ) parts.push( 'status=' + obj.statusCode );
		if ( typeof obj.latencyMs !== 'undefined' ) parts.push( 'latency=' + obj.latencyMs + 'ms' );
		if ( typeof obj.contentLength !== 'undefined' ) parts.push( 'size=' + obj.contentLength );
		return parts.join( ' ' );
	}

	_formatApp( obj )
	{
		let parts = [];
		if ( obj.connector ) parts.push( obj.connector );
		if ( obj.command ) parts.push( '#' + obj.command );
		if ( obj.step ) parts.push( 'step=' + obj.step );
		if ( typeof obj.durationMs !== 'undefined' ) parts.push( 'duration=' + obj.durationMs + 'ms' );
		return parts.join( ' ' );
	}

	_formatEntry( source, obj, verbosity )
	{
		// Compute shown level
		let levelNumber = ( typeof obj.level === 'number' ) ? obj.level : ( this._levelThresholdForVerbosity( verbosity ) );
		let levelName = this._levelNameFromValue( levelNumber );
		if ( !this._shouldPrint( verbosity, levelNumber ) ) return '';

		const time = this._formatTimestamp( obj.time );
		const common = this._formatCommon( obj );
		const specific = source === 'http' ? this._formatHttp( obj ) : this._formatApp( obj );
		let msg = obj.msg ? ('' + obj.msg) : '';
		let errPart = '';
		if ( obj.errorCode ) errPart += ' code=' + obj.errorCode;
		if ( obj.err && obj.err.message ) errPart += ' err=' + obj.err.message;
		let segs = [ time, levelName, source, common, specific, msg, errPart ];
		return segs.filter( s => !!s && ('' + s).length > 0 ).join( ' ' );
	}

	// Internal logging helper
	_log( target, parameters )
	{
		if ( !parameters ) parameters = {};
		var { level, verbosity, msg } = parameters;
		var logger = ( target == 'http' ) ? this.httpLogger : this.appLogger;
		if ( !logger ) return;
		var pinoLevel = level ? this._normalizeLevel( level, verbosity ) : this._mapVerbosityToLevel( verbosity );
		var payload = Object.assign( {}, parameters );
		delete payload.level;
		delete payload.verbosity;
		delete payload.msg;
		payload.source = target;
		try
		{
			if ( pinoLevel == 'error' && payload.err && typeof payload.err === 'object' )
				logger.error( payload, msg || 'error' );
			else if ( logger[ pinoLevel ] )
				logger[ pinoLevel ]( payload, msg || '' );
			else
				logger.info( payload, msg || '' );
		}
		catch( e )
		{
			// Last-resort: avoid throwing from logger
			try { logger.info( { source: target, fallbackError: '' + e }, 'log failure' ); } catch( _ ) {}
		}
	}

  	// Helper to iterate lines in a file as JSON log entries
	async _readLogFileLines( filePath, fnEachLine )
	{
		return await new Promise( ( resolve ) =>
		{
			try
			{
				const stream = FS.createReadStream( filePath, { encoding: 'utf8' } );
				const rl = readline.createInterface( { input: stream, crlfDelay: Infinity } );
				rl.on( 'line', ( line ) => { fnEachLine( line ); } );
				rl.on( 'close', () => { resolve( true ); } );
				stream.on( 'error', () => { resolve( false ); } );
			}
			catch( e )
			{
				resolve( false );
			}
		} );
	}

	_filesForSource( source )
	{
		const dir = ( source == 'http' ) ? this.httpDir : this.appDir;
		const base = ( source == 'http' ) ? this.httpFilename : this.appFilename;
		try
		{
			const files = FS.readdirSync( dir )
				.filter( f => f.startsWith( base ) )
				.map( f => Path.join( dir, f ) )
				.sort();
			return files;
		}
		catch( e )
		{
			return [];
		}
	}


  ///////////////////////////////////////////////////////////////////////////
  // REST exposed commands
  ///////////////////////////////////////////////////////////////////////////

	// command_logHttp: write one HTTP log entry
	async command_logHttp( parameters, message, editor )
	{
		try
		{
			const p = parameters || {};
			this._log( 'http', p );
			let out = '';
			if ( p.format )
			{
				const verbosity = p.formatVerbosity || p.verbosity || 'low';
				out = this._formatEntry( 'http', p, verbosity );
			}
			return this.replySuccess( this.newAnswer( { ok: true, formatted: out }, '', 'data' ), message, editor );
		}
		catch( e )
		{
			return this.replyError( this.newError( { message: 'awi:log-http-failed', data: e } ), message, editor );
		}
	}

	// command_logApp: write one App log entry
	async command_logApp( parameters, message, editor )
	{
		try
		{
			const p = parameters || {};
			this._log( 'app', p );
			let out = '';
			if ( p.format )
			{
				const verbosity = p.formatVerbosity || p.verbosity || 'low';
				out = this._formatEntry( 'app', p, verbosity );
			}
			return this.replySuccess( this.newAnswer( { ok: true, formatted: out }, '', 'data' ), message, editor );
		}
		catch( e )
		{
			return this.replyError( this.newError( { message: 'awi:log-app-failed', data: e } ), message, editor );
		}
	}

	// Format without writing
	async command_formatLog( parameters, message, editor )
	{
		try
		{
			const p = parameters || {};
			const source = ( p && p.source ) || 'app';
			const verbosity = p.formatVerbosity || p.verbosity || 'low';
			const text = this._formatEntry( source, p, verbosity );
			return this.replySuccess( this.newAnswer( { text }, '', 'data' ), message, editor );
		}
		catch( e )
		{
			return this.replyError( this.newError( { message: 'awi:format-log-failed', data: e } ), message, editor );
		}
	}

	// Filters: { source: 'http'|'app', userId?, userName?, from?, to?, verbosity? }
	async command_getLogs( parameters, message, editor )
	{
		try
		{
			const source = ( parameters && parameters.source ) || 'app';
			const userId = parameters && parameters.userId ? ('' + parameters.userId) : null;
			const userName = parameters && parameters.userName ? ('' + parameters.userName) : null;
			const fromTs = parameters && parameters.from ? new Date( parameters.from ).getTime() : null;
			const toTs = parameters && parameters.to ? new Date( parameters.to ).getTime() : null;
			const minLevel = this._levelThresholdForVerbosity( parameters && parameters.verbosity );
			const limit = Math.max( 0, Math.min( parameters && parameters.limit ? parameters.limit : 500, 5000 ) );

			let collected = [];
			let files = this._filesForSource( source );
			for ( let i = 0; i < files.length; i++ )
			{
				const ok = await this._readLogFileLines( files[ i ], ( line ) =>
				{
					if ( !line || !line.trim() ) return;
					let obj = null;
					try { obj = JSON.parse( line ); } catch( _ ) { return; }
					if ( typeof obj.level === 'number' && obj.level < minLevel ) return;
					if ( fromTs && obj.time && obj.time < fromTs ) return;
					if ( toTs && obj.time && obj.time > toTs ) return;
					if ( userId && ('' + (obj.userId || '')) !== userId )
					{
						// Allow match on userName if provided instead
						if ( !( userName && ('' + (obj.userName || '')) === userName ) ) return;
					}
					if ( userName && ('' + (obj.userName || '')) !== userName )
					{
						// Allow match on userId if provided instead
						if ( !( userId && ('' + (obj.userId || '')) === userId ) ) return;
					}
					collected.push( obj );
				} );
				if ( !ok ) continue;
				if ( collected.length >= limit ) break;
			}
			return this.replySuccess( this.newAnswer( { items: collected.slice( 0, limit ) }, '', 'data' ), message, editor );
		}
		catch( e )
		{
			return this.replyError( this.newError( { message: 'awi:get-logs-failed', data: e } ), message, editor );
		}
	}

	// Extract logs to a file (optionally forcing user area on Linux)
	async command_extractLogs( parameters )
	{
		try
		{
			const source = ( parameters && parameters.source ) || 'app';
			const files = this._filesForSource( source );
			const userId = parameters && parameters.userId ? ('' + parameters.userId) : null;
			const userName = parameters && parameters.userName ? ('' + parameters.userName) : null;
			const fromTs = parameters && parameters.from ? new Date( parameters.from ).getTime() : null;
			const toTs = parameters && parameters.to ? new Date( parameters.to ).getTime() : null;
			const minLevel = this._levelThresholdForVerbosity( parameters && parameters.verbosity );

			// Compute output path
			let outPath = parameters && parameters.outPath;
			const platform = this.awi.system.getSystemInformation( 'platform' );
			if ( !outPath )
			{
				if ( platform == 'linux' )
					outPath = Path.join( this.awi.system.getSystemInformation( 'userDir' ), 'AWI-Logs', 'export' );
				else
					outPath = Path.join( this.basePath, 'export' );
			}
			await this.awi.files.createDirectories( outPath );
			const fileName = `${ source }-extract-${ Date.now() }.log`;
			const dest = Path.join( outPath, fileName );

			let bytes = 0, lines = 0;
			const ws = FS.createWriteStream( dest, { flags: 'w', encoding: 'utf8' } );
			for ( let i = 0; i < files.length; i++ )
			{
				await this._readLogFileLines( files[ i ], ( line ) =>
				{
					if ( !line || !line.trim() ) return;
					let obj = null;
					try { obj = JSON.parse( line ); } catch( _ ) { return; }
					if ( typeof obj.level === 'number' && obj.level < minLevel ) return;
					if ( fromTs && obj.time && obj.time < fromTs ) return;
					if ( toTs && obj.time && obj.time > toTs ) return;
					if ( userId && ('' + (obj.userId || '')) !== userId )
					{
						// Allow match on userName if provided instead
						if ( !( userName && ('' + (obj.userName || '')) === userName ) ) return;
					}
					if ( userName && ('' + (obj.userName || '')) !== userName )
					{
						// Allow match on userId if provided instead
						if ( !( userId && ('' + (obj.userId || '')) === userId ) ) return;
					}
					const out = JSON.stringify( obj ) + '\n';
					ws.write( out );
					bytes += out.length;
					lines++;
				} );
			}
			ws.end();
			return this.replySuccess( this.newAnswer( { outputPath: dest, bytes: bytes, lines: lines }, '', 'data' ), message, editor );
		}
		catch( e )
		{
			return this.replyError( this.newError( { message: 'awi:extract-logs-failed', data: e } ), message, editor );
		}
	}
}
