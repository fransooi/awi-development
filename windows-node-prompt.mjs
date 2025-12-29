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
* @file windows-node-prompt.mjs
* @author FL (Francois Lionet)
* @date first pushed on 23/07/2025
* @version 0.5
*
* @short Starts Awi as simple command line prompt (Windows)
*
*/
import Awi from './awi.mjs';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: join(__dirname, '.env') });

const databasePrefix = ''; // e.g., 'MYPROJECT_'
const projectName = 'AWI Server';

async function startAwi( prompt, config )
{
	var basket = {};
	var awi = new Awi( null, config );
	var answer = await awi.connect( {} );
	if ( answer.isSuccess() )
	{
		if ( awi.http )
			await awi.http.printStartupBanner();
		await awi.prompt.prompt( { prompt: prompt || '' }, basket, { editor: awi.editor } );
	}
	else
	{
		process.exit( 1 );
	}
}

// Default arguments
////////////////////
function getArguments()
{
	var domain = 'http://localhost:8080';
	var publicUrlPath = './data/public/temp';
	var publicUrl = domain + '/temp';
	var dataRoot = './data';
	var dataPath = './data';
	var httpRootDirectory = './data/public';
	var configurationPath = './data/configs';
	var logsPath = './data/logs';
	var storagePath = './data/storage';
	var tempPath = './data/temp';
	var propertiesPath = './data/properties';
	var priority = 100;
	var answer =
	{
		prompt: '',
		config: {},
		elements:
		[
			{ name: 'connectors/system/logging', config: { priority: priority }, options: {
				basePath: logsPath
			} },
			{ name: 'connectors/system/node', config: { priority: --priority }, options: {} },
			{ name: 'connectors/system/files', config: { priority: --priority }, options: {} },
			{ name: 'connectors/system/zip', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/messages', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/utilities', config: { priority: --priority }, options: {} },
			{ name: 'connectors/editor/editor', config: { priority: --priority }, options: {
				useColors: false,
				path: './editor',
				editors: {
					'commandline': {},
					'http': {},
					'websocket': {}
				}
			} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Database connectors, Supabase = https://supabase.com/
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/database/supabase', config: { priority: --priority }, options: {
				databasePrefix: databasePrefix,
				delayed: true
			} },
			//{ name: 'connectors/database/storage', config: { priority: --priority }, options: {
			//	fileMode: 'supabase',
			//	url: process.env[databasePrefix + 'SUPABASE_URL'],
			//	secretKey: process.env[databasePrefix + 'SUPABASE_SECRET_KEY'],
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
			{ name: 'connectors/awi/configuration', config: { priority: --priority,
				configurationPath: configurationPath,
				dataPath: dataPath,
				tempPath: tempPath
			}, options: { } },
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
			//{ name: 'connectors/awi/authentification_oauth', config: { priority: --priority }, options: {} },

      ////////////////////////////////////////////////////////////////////////////////////
      // Network, default is http://localhost:8080
      // https is not enabled by default
      // TLS options are empty by default
      // Can work behing NGINX or/and Cloudflare
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/network/httpserver', config: { priority: --priority }, options: {
				rootDirectory: httpRootDirectory,
				envFilePath: join(__dirname, '.env'),
				enableHttp: true,
				enableHttps: false,
				port: 8080,
				httpsPort: 8080,
				domain: domain,
				tlsOptions: {},
				databasePrefix: databasePrefix,
				projectName: projectName
			} },

      ////////////////////////////////////////////////////////////////////////////////////
      // ClouddFlare turnstile for security box (need Cloudflare account)
      ////////////////////////////////////////////////////////////////////////////////////
			//{ name: 'connectors/network/cloudfare', config: { priority: --priority }, options: {
			//	turnstileSecret: process.env.CLOUDFARE_TURNSTILE_SECRET
			//} },
      
      ////////////////////////////////////////////////////////////////////////////////////
      // Websocket server, can work behind NGINX or/and Cloudflare
      // Default port is 1033
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/network/websocketserver', config: { priority: --priority }, options: {
					port: 1033
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
			{ name: 'connectors/ai/aiedenspeech', config: { priority: --priority }, options: { aiKey: process.env.EDEN_AI_KEY } },
			{ name: 'connectors/ai/aiedentext', config: { priority: --priority }, options: { aiKey: process.env.EDEN_AI_KEY } },
			{ name: 'connectors/ai/aiedenchat', config: { priority: --priority }, options: { aiKey: process.env.EDEN_AI_KEY } },

      ////////////////////////////////////////////////////////////////////////////////////
      // Commmand line direct interface
      ////////////////////////////////////////////////////////////////////////////////////
			{ name: 'connectors/awi/parser', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/persona', config: { priority: --priority }, options: {} },
			{ name: 'connectors/awi/prompt', config: { priority: --priority }, options: {} },
		]
	};

	var error = false;
	var quit = false;
	for ( var a = 2; ( a < process.argv.length ) && !quit && !error; a++ )
	{
		var command = process.argv[ a ].toLowerCase();

		var pos;
		if( ( pos = command.indexOf( '--configurations=' ) ) >= 0 )
		{
			answer.config.configurations = command.substring( pos, command.length );
		}
		else if( ( pos = command.indexOf( '--engine=' ) ) >= 0 )
		{
			answer.config.engine = command.substring( pos, command.length );
		}
		else if( ( pos = command.indexOf( '--data=' ) ) >= 0 )
		{
			answer.config.data = command.substring( pos, command.length );
		}
		else if ( !error )
		{
			if ( answer.prompt.length > 0 )
				answer.prompt += ' ';
			answer.prompt += command;
		}
	}
	return { success: !error, data: answer };
};

var answer = getArguments();
if ( answer.success )
{
	startAwi( answer.data.prompt, answer.data );
}

