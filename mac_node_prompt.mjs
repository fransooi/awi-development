/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal
* (_)|____| |____|\__/\__/ [_| |_] \     Assistant
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file mac_node_prompt.mjs
* @author FL (Francois Lionet)
* @date first pushed on 10/11/2019
* @version 0.5
*
* @short Starts Awi as simple command line prompt for macOS development
*
*/
import Awi from './awi.mjs';
import { config as loadEnv } from './env.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(__dirname, '.env') });

const projectPrefix = 'TOCOMPLETE_';
const projectName = 'Awi Server';
const userVerbosity = 4;

async function startAwi( prompt, config )
{
	var basket = {};
	var awi = new Awi( null, config );

	// Graceful shutdown handler
	const shutdown = async () => {
		console.log( '\n.(°°) Closing network connections...' );
		const closePromises = [];

		if ( awi.http )
		{
			if ( awi.http.httpServer )
			{
				closePromises.push( new Promise( resolve => {
					awi.http.httpServer.close( (err) => {
						if (err) console.error('Error closing HTTP server:', err);
						resolve();
					});
				}));
			}
			if ( awi.http.httpsServer )
			{
				closePromises.push( new Promise( resolve => {
					awi.http.httpsServer.close( (err) => {
						if (err) console.error('Error closing HTTPS server:', err);
						resolve();
					});
				}));
			}
		}

		if ( awi.websocket && awi.websocket.wsServer )
		{
			closePromises.push( new Promise( resolve => {
				awi.websocket.wsServer.close( (err) => {
					if (err) console.error('Error closing WebSocket server:', err);
					resolve();
				});
				if (awi.websocket.wsServer.clients) {
					for (const client of awi.websocket.wsServer.clients) {
						client.terminate();
					}
				}
			}));
		}

		if ( closePromises.length > 0 )
		{
			await Promise.all( closePromises );
			await new Promise( resolve => setTimeout( resolve, 500 ) );
		}

		process.exit( 0 );
	};
	process.on( 'SIGINT', shutdown );
	process.on( 'SIGTERM', shutdown );

	var answer = await awi.connect( {} );
	if ( answer.isSuccess() )
	{
		await awi.prompt.prompt( { prompt: prompt || '' }, basket, { editor: awi.editor } );
	}
	else
	{
		process.exit( 1 );
	}
}

// Default arguments for macOS development
////////////////////
function getArguments()
{
	var domain = process.env[projectPrefix + 'DOMAIN'] || 'http://localhost:8080';
	var port = parseInt(process.env[projectPrefix + 'PORT']) || 8080;
	var wsPort = parseInt(process.env[projectPrefix + 'WS_PORT']) || 1033;
  var envDataRoot = process.env[projectPrefix + 'DATA_ROOT'] || process.env.DATA_ROOT;
	var dataRoot = envDataRoot || './data';
	var dataPath = envDataRoot || './data';
	var httpRootDirectory = envDataRoot ? (envDataRoot + '/public') : './data/public';
	var configurationPath = envDataRoot ? (envDataRoot + '/configs') : './data/configs';
	var logsPath = envDataRoot ? (envDataRoot + '/logs') : './data/logs';
	var storagePath = envDataRoot ? (envDataRoot + '/storage') : './data/storage';
	var tempPath = envDataRoot ? (envDataRoot + '/temp') : './data/temp';
	var propertiesPath = envDataRoot ? (envDataRoot + '/properties') : './data/properties';
	var publicUrlPath = envDataRoot ? (envDataRoot + '/public/temp') : './data/public/temp';
	var publicUrl = domain + '/temp';
	var priority = 100;
	var answer =
	{
		prompt: '',
		logFilter: 'info warning error',
		userVerbosity: userVerbosity,
    projectPrefix: projectPrefix,
    projectName: projectName,
		config: {},
		elements:
		[
			{ name: 'connectors/system/logging', config: { priority: priority }, options: {
				basePath: logsPath
			} },
			{ name: 'connectors/system/node', config: { priority: --priority }, options: {} },
			{ name: 'connectors/system/files', config: { priority: --priority }, options: {} },
			{ name: 'connectors/system/zip', config: { priority: --priority }, options: {} },
      { name: 'connectors/awi/utilities', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/configuration', config: { priority: --priority,
				configurationPath: configurationPath,
				dataPath: dataPath,
				tempPath: tempPath
			}, options: { } },
			{ name: 'connectors/awi/messages', config: { priority: --priority }, options: {} },


      ////////////////////////////////////////////////////////////////////////////////////
      // Database connectors, Supabase = https://supabase.com/
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/database/supabase', config: { priority: --priority }, options: {
				projectPrefix: projectPrefix,
				url: process.env[projectPrefix + 'SUPABASE_URL'],
				secretKey: process.env[projectPrefix + 'SUPABASE_SECRET_KEY'],
				serviceRoleKey: process.env[projectPrefix + 'SUPABASE_SERVICE_ROLE_KEY']
			} },
			//{ name: 'connectors/database/storage', config: { priority: --priority }, options: {
			//	fileMode: 'supabase',
			//	url: process.env[projectPrefix + 'SUPABASE_URL'],
			//	secretKey: process.env[projectPrefix + 'SUPABASE_SECRET_KEY'],
			//	// Fallback for local file mode (if needed)
			//	storagePath: storagePath,
			//	publicUrlPath: publicUrlPath,
			//	publicUrl: publicUrl
			//} },
      
      ////////////////////////////////////////////////////////////////////////////////////
      // Cron: call other connectors at specific times (needs supabase)
      ////////////////////////////////////////////////////////////////////////////////////
      //{ name: 'connectors/awi/cron', config: { priority: --priority }, options: {} },
      ////////////////////////////////////////////////////////////////////////////////////

      ////////////////////////////////////////////////////////////////////////////////////
      // Connectors to online Agendas
      ////////////////////////////////////////////////////////////////////////////////////
			//{ name: 'connectors/agenda/agendas', config: { priority: --priority }, options: {
			//	agendas: {
			//	supabase: { config: { priority: --priority }, options: {} },
			//	google: { config: { priority: --priority }, options: {} },
			//          			//zoom: { config: { priority: 99 }, options: {} },
			//}
			//} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Connectors to online Drives
      ////////////////////////////////////////////////////////////////////////////////////
			//{ name: 'connectors/drive/drives', config: { priority: --priority }, options: {
			//	drives: {
			//		google: { config: { priority: --priority }, options: {} }
			//}
			//} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Configuration
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/awi/properties', config: { priority: --priority,
				propertiesPath: propertiesPath
			}, options: { } },
			{ name: 'connectors/awi/time', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/audio', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/convertors', config: { priority: --priority }, options: {} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Authentication (need Google Cloud oauth via Supabase, handles Android apps too, 
      // iPhone to come)
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/awi/authentification_oauth', config: { priority: --priority }, options: {
				projectPrefix: projectPrefix,
				googleClientId: process.env[projectPrefix + 'GOOGLE_CLIENT_ID'] || process.env.GOOGLE_CLIENT_ID,
				googleClientSecret: process.env[projectPrefix + 'GOOGLE_CLIENT_SECRET'] || process.env.GOOGLE_CLIENT_SECRET
			} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Network, default is http://localhost:8080
      // https is not enabled by default
      // TLS options are empty by default
      // Can work behing NGINX or/and Cloudflare
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/network/httpserver', config: { priority: --priority }, options: {
				rootDirectory: httpRootDirectory,
				envFilePath: join(__dirname, '.env'),
				enableHttp: false,
				enableHttps: false,
				port: port,
				httpsPort: port,
				domain: domain,
				tlsOptions: {},
				projectPrefix: projectPrefix,
				projectName: projectName,
				zoomWebhookPath: process.env[projectPrefix + 'ZOOM_WEBHOOK_PATH'] || process.env.ZOOM_WEBHOOK_PATH,
				zoomSecretToken: process.env[projectPrefix + 'ZOOM_SECRET_TOKEN'] || process.env.ZOOM_SECRET_TOKEN,
				workspaceEventsWebhookPath: process.env[projectPrefix + 'WORKSPACE_EVENTS_WEBHOOK_PATH'] || process.env.WORKSPACE_EVENTS_WEBHOOK_PATH,
				zoomClientId: process.env[projectPrefix + 'ZOOM_CLIENT_ID'] || process.env.ZOOM_CLIENT_ID,
				zoomClientSecret: process.env[projectPrefix + 'ZOOM_CLIENT_SECRET'] || process.env.ZOOM_CLIENT_SECRET,
				zoomRedirectUrl: process.env[projectPrefix + 'ZOOM_REDIRECT_URL'] || process.env.ZOOM_REDIRECT_URL,
				zoomOauthScopes: process.env[projectPrefix + 'ZOOM_OAUTH_SCOPES'] || process.env.ZOOM_OAUTH_SCOPES
			} },

      ////////////////////////////////////////////////////////////////////////////////////
      // ClouddFlare turnstile for security box (need Cloudflare account)
      ////////////////////////////////////////////////////////////////////////////////////
			//{ name: 'connectors/network/cloudfare', config: { priority: --priority }, options: {
			//	turnstileSecret: process.env[projectPrefix + 'CLOUDFARE_TURNSTILE_SECRET'] || process.env.CLOUDFARE_TURNSTILE_SECRET
			//} },
      
      ////////////////////////////////////////////////////////////////////////////////////
			// Websocket server, can work behind NGINX or/and Cloudflare
			// Default port is 1033
			////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/network/websocketserver', config: { priority: --priority }, options: {
					port: wsPort,
					enable: false
			} },

			////////////////////////////////////////////////////////////////////////////////////
      // Bubbles
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'bubbles/awi/*', config: {}, options: {} },
			{ name: 'souvenirs/awi/*', config: {}, options: {} },
			{ name: 'memories/awi/*', config: {}, options: {} },

      ////////////////////////////////////////////////////////////////////////////////////
      // AI, need Eden AI account and key
      // EdenAI, all AI providers with same simple REST commands
      // text, speech, image, video, generative, RAGs you name it.
      // https://www.edenai.co/
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/ai/aiedenspeech', config: { priority: --priority }, options: { aiKey: process.env[projectPrefix + 'EDEN_AI_KEY'] || process.env.EDEN_AI_KEY } },
			{ name: 'connectors/ai/aiedentext', config: { priority: --priority }, options: { aiKey: process.env[projectPrefix + 'EDEN_AI_KEY'] || process.env.EDEN_AI_KEY } },
			{ name: 'connectors/ai/aiedenchat', config: { priority: --priority }, options: { aiKey: process.env[projectPrefix + 'EDEN_AI_KEY'] || process.env.EDEN_AI_KEY } },

      ////////////////////////////////////////////////////////////////////////////////////
      // Commmand line direct interface
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/awi/parser', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/persona', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/prompt', config: { priority: --priority }, options: {} },
			{ name: 'connectors/editor/editor', config: { priority: --priority }, options: {
				useColors: false,
				path: './editor',
				editors: {
					'commandline': {},
					'http': {},
					'websocket': {}
				}
			} }
		]
	};

	var error = false;
	var quit = false;
	for ( var a = 2; ( a < process.argv.length ) && !quit && !error; a++ )
	{
		var arg = process.argv[ a ];
		var lowerArg = arg.toLowerCase();

		var pos;
		if( ( pos = lowerArg.indexOf( '--configurations=' ) ) >= 0 )
		{
			answer.config.configurations = arg.substring( pos, arg.length );
		}
		else if( ( pos = lowerArg.indexOf( '--engine=' ) ) >= 0 )
		{
			answer.config.engine = arg.substring( pos, arg.length );
		}
		else if( ( pos = lowerArg.indexOf( '--data=' ) ) >= 0 )
		{
			answer.config.data = arg.substring( pos, arg.length );
		}
		else if( ( pos = lowerArg.indexOf( '--verbose=' ) ) >= 0 )
		{
			var v = parseInt( arg.substring( pos + 10 ) );
			if ( !isNaN( v ) )
				answer.userVerbosity = Math.max( 1, Math.min( 4, v ) );
		}
		else if ( !error )
		{
			if ( answer.prompt.length > 0 )
				answer.prompt += ' ';
			answer.prompt += arg;
		}
	}
	return { success: !error, data: answer };
};

var answer = getArguments();
if ( answer.success )
{
	startAwi( answer.data.prompt, answer.data );
}

