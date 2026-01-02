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
* @file configuration.mjs
* @author FL (Francois Lionet)
* @version 0.3
*
* @short Configuration management connector
*
*/
import ConnectorBase from '../../connector.mjs'
export { ConnectorConfiguration as Connector }

class ConnectorConfiguration extends ConnectorBase
{
	constructor( awi, config )
	{
		super( awi, config );
		this.name = 'Configuration';
		this.token = 'configuration';
		this.className = 'ConnectorConfiguration';
		this.group = 'awi';
		this.version = '0.5';

		this.user = '';
		this.configs = {};
		this.platform = 'win32';
		this.baskets = {};

		var self = this;
		if ( typeof config.configurationPath == 'undefined' )
			this.getConfigurationPath = function(){ return awi.system.getEnginePath() + '/configs' };
		else if ( typeof config.configurationPath == 'string' )
		{
			config.configurationPath = this.awi.system.denormalize( config.configurationPath );
			this.getConfigurationPath = function(){ return config.configurationPath };
		}
		else
		{
			this.getConfigurationPath = config.configurationPath;
		}

		if ( typeof config.dataPath == 'undefined' )
			this.getDataPath = function(){ return awi.engine.getEnginePath() + '/data' };
		else if ( typeof config.dataPath == 'string' )
		{
			config.dataPath = this.awi.system.denormalize( config.dataPath );
			this.getDataPath = function(){ return config.dataPath };
		}
		else
		{
			this.getDataPath = config.dataPath;
		}

		if ( typeof config.tempPath == 'undefined' )
			this.getTempPath = function(){ return awi.system.getEnginePath() + '/data/temp' };
		else if ( typeof config.tempPath == 'string' )
		{
			config.tempPath = this.awi.system.denormalize( config.tempPath );
			this.getTempPath = function(){ return config.tempPath };
		}
		else
		{
			this.getTempPath = config.tempPath;
		}

		this.edenAiHookKey = '';
	}
	async connect( options )
	{
		super.connect( options );
		this.platform = this.awi.system.getSystemInformation( 'platform' );
		var answer = await this.loadConfigs();
		return this.setConnected( answer.isSuccess() );
	}
	async setSubConfigs( configs )
	{
		for ( var c = 0; c < configs.length; c++ )
		{
			var connectorConfig = configs[ c ];
			if ( connectorConfig && connectorConfig.config && connectorConfig.config.subConfigs )
			{
				var split = connectorConfig.name.split('/');
				var connector = this.awi.connectors[ split[ 1 ] + '-' + split[ 2 ] ];
				if ( !connector )
					return this.newError( { message: 'awi:connector-not-found', data: connectorConfig.name }, { functionName: 'setSubConfigs' } );
				for ( var subConfigKey in connectorConfig.config.subConfigs )
				{
					var subConfig = connectorConfig.config.subConfigs[ subConfigKey ];
					var configAnswer = await this.getToolConfiguration( connector.token, subConfigKey );
					if ( configAnswer.isError() )
						configAnswer = await this.awi.configuration.createToolConfiguration( connector.token, subConfigKey , {} );
					if ( configAnswer.isSuccess() )
					{
						var config = configAnswer.getValue();
						for ( var p in subConfig )
							config[ p ] = subConfig[ p ];
					}
				}
			}
		}
		await this.saveConfigs();
		return this.newAnswer( true );
	}
	isUserLogged()
	{
		return this.user.length > 0;
	}
	getUserConfig(userName)
	{
		return this.getConfig( userName );
	}
	getConfig( id )
	{
		if ( id == 'user' )
		{
			if ( this.userId && this.userIdToConfig[ this.userId ] )
				return this.userIdToConfig[ this.userId ];
			return this.configs[ 'user' ];
		}
		else if ( id == 'persona' )
		{
			const userConfig = this.getConfig( 'user' );
			if ( userConfig )
				id = 'persona-' + userConfig.persona;
			else
				id = 'persona-awi';
		}
		return this.configs[ id ];
	}
	getBasket( type )
	{
		if ( type == 'user' )
		{
			type = this.user;
			if ( !type )
				type = 'user';
		}
		if ( this.baskets[ type ] )
			return this.baskets[ type ];
		return {};
	}
	setBasket( type, basket )
	{
		if ( type == 'user' )
		{
			type = this.user;
			if ( !type )
				type = 'user';
		}
		this.baskets[ type ] = basket;
	}
	getConfigValue( type, name, defaultValue )
	{
		var config = this.getConfig( type );
		if ( !config )
			return defaultValue;
		var dot = name.indexOf( '.' );
		while( dot >= 0 )
		{
			var left = name.substring( 0, dot );
			name = name.substring( dot + 1 );
			config = config[ left ];
			if ( typeof config == 'undefined' )
				return defaultValue;
			dot = name.indexOf( '.' );
		}
		if ( typeof config[ name ] == 'undefined' )
			return defaultValue;
		return config[ name ];
	}
	async getToolConfiguration( toolGroup, toolName )
	{
		if ( this.user == '' )
			return this.newError( { message: 'awi:user-not-connected' }, { functionName: 'getToolConfiguration' } );
		var config = this.getConfig( 'user' );
		var toolConfig = config.tools[ toolGroup + '-' + toolName ];
		if ( !toolConfig )
			return this.newError( { message: 'awi:tool-config-not-found', data: toolGroup + '-' + toolName }, { functionName: 'getToolConfiguration' } );
		return this.newAnswer( toolConfig );
	}
	async createToolConfiguration( toolGroup, toolName, configuration )
	{
		if ( this.user == '' )
			return this.newError( { message: 'awi:user-not-connected' }, { functionName: 'createToolConfiguration' } );
		var config = this.getConfig( 'user' );
		config.tools[ toolGroup + '-' + toolName ] = configuration;
		return this.newAnswer( configuration );
	}
	getNewUserConfig()
	{
		return this.awi.utilities.copyObject( this.configs[ 'user' ] );
	}
	async setNewUserConfig( name, config )
	{
		if ( name != 'user' && name != 'system' )
		{
			this.configs[ name ] = config;
			var persona = await this.loadConfig( 'persona-' + config.persona );
			persona.prompts[ 'user' ] = '.(' + name + ') ';
			persona.token = config.persona;
			this.configs[ 'persona-' + config.persona ] = persona;
			this.userIdToConfig[ config.userId ] = config;
		}
	}
	getPersona( name )
	{
		var config = this.getConfig( name );
		if ( !config )
			return null;
		return this.getConfig( 'persona-' + config.persona );
	}
	setPersona( token, config )
	{
		var persona = this.getConfig( 'persona-' + token );
		if ( !persona )
			return null;
		this.configs[ 'persona-' + token ] = config;
	}
	checkUserConfig( name )
	{
		return this.configs[ name ];
	}
	getUserList()
	{
		var list = [];
		for ( var c in this.configs )
		{
			var config = this.configs[ c ];
			if ( typeof config.fullName != 'undefined' && config.fullName )
			{
				list.push( config );
			}
		}
		return list;
	}
	async saveConfigs( name )
	{
		if (!this.awi.database)
		{ 
			return this.newError({ message: 'database-connector-not-found' }, { functionName: 'saveConfigs' });
		}

		if ( name )
		{
			name = name.toLowerCase();
			const userConfig = this.configs[name];
			if (!userConfig || !userConfig.userId)
				return this.newError({ message: 'user-config-invalid', data: name }, { functionName: 'saveConfigs' });

			// Save the main user config
			let answer = await this.awi.database.updateUserConfig({ userId: userConfig.userId, config: userConfig });
			if (answer.isError()) return answer;

			// Save the associated personality
			const personaConfig = this.configs['persona-' + userConfig.persona];
			if (personaConfig) {
				answer = await this.awi.database.updateNamedConfig({
					userId: userConfig.userId,
					type: 'personality',
					name: userConfig.persona,
					data: personaConfig
				});
				if (answer.isError()) return answer;
			}
		}
		else
		{
			for (const key in this.configs )
			{
				const config = this.configs[key];
				if (!config) continue;
				if (config.userId) { // This is a main user config
					await this.awi.database.updateUserConfig({ userId: config.userId, config: config });
				} else if (key.startsWith('persona-')) {
					// This is a personality, but we need to find which user it belongs to.
					// This part is tricky without a direct link. The logic will need to be adapted.
					// For now, we assume personalities are saved with their user.
				} else {
					// Handle other types like 'system' or 'user-default' if needed.
					// These are often not saved.
				}
			}
		}
		return this.newAnswer( true );
	}

	async loadConfigForUser(userId) {

		if (!this.awi.database) {
			return this.newError({ message: 'database-connector-not-found' }, { functionName: 'loadConfigForUser' }	);
		}
		if (this.userIdToConfig[userId]) {
			return this.newAnswer(this.userIdToConfig[userId]);
		}

		// This function fetches a user's main config from the database and caches it.
		const answer = await this.awi.database.getUserConfig({ userId });
		if (answer.isError()) {
			return answer;
		}

		const config = answer.getValue();
		if (config && config.userName) {
			this.configs[config.userName] = config;
			this.userIdToConfig[config.userId] = config;
		}
		return answer;
	}

	async loadConfigs()
	{
		const newConfigs = {};
		const newUserIdToConfig = {};

		// If database is not available (e.g. delayed for setup), load defaults and return success
		if (!this.awi.database)
		{
			this.awi.log('Database not available, loading default configurations.', { level: 'info', className: this.className });
			// Load defaults into temporary configs
			// Note: loadConfig usually writes to this.configs. We need to be careful.
			// Since loadConfig is complex and writes to this.configs, we will rely on the fact that
			// without DB, it's synchronous-ish or fast.
			// BETTER APPROACH: Since loadConfig writes to this.configs, we can't easily isolate it without refactoring loadConfig.
			// INSTEAD: We will preserve the old configs and restore them if needed, OR populate default system config immediately.
			
			// Quick fix: Initialize system config immediately so it's never undefined
			this.configs = { system: this.getSystemConfigDefault() }; 
			await this.loadConfig( 'system' );
			await this.loadConfig( 'user' );
			await this.loadConfig( 'persona' );
			return this.newAnswer(this.configs);
		}

		// 1. Load all main user configurations
		const userConfigsAnswer = await this.awi.database.getAllUserConfigs();
		if (userConfigsAnswer.isError()) {
			this.awi.log('Failed to load user configs from database: ' + userConfigsAnswer.message, { level: 'error', className: this.className });
			// Do not return early, proceed to load defaults so server can boot
		} else {
			const userConfigs = userConfigsAnswer.getValue();
			for (const record of userConfigs) {
				// The user's config is identified by their user_id, but the old system used 'userName'.
				// For now, we will need a way to map user_id to userName. Let's assume userName is in the config.
				const userName = record.main_config.userName?.toLowerCase();
				if (userName)
					newConfigs[userName] = record.main_config;
				newUserIdToConfig[record.main_config.userId] = record.main_config;
			}
		}

		// 2. Load all named configurations (like personalities)
		const namedConfigsAnswer = await this.awi.database.getAllNamedConfigs();
		if (namedConfigsAnswer.isError()) {
			this.awi.log('Failed to load named configs from database: ' + namedConfigsAnswer.message, { level: 'error', className: this.className });
			// Do not return early
		} else {
			const namedConfigs = namedConfigsAnswer.getValue();
			for (const record of namedConfigs) {
				const configKey = `${record.config_type}-${record.config_name}`.toLowerCase();
				newConfigs[configKey] = record.config_data;
			}
		}

		// 3. Ensure default configs are present if not loaded from DB
		// We manually check newConfigs and populate if missing
		// This requires calling loadConfig, which writes to this.configs.
		// To fix the race properly, we should just assign newConfigs to this.configs NOW, 
		// but merging with defaults.
		
		// Optimization: Assign what we have so far, but ensure 'system' exists first.
		if (!newConfigs['system']) {
			// If we didn't get system from DB, we need to generate it.
			// We can use the existing loadConfig but we need to trick it or copy the result.
			// Simplest: Let's just set this.configs to newConfigs mixed with current defaults.
			
			// CRITICAL FIX: Ensure 'system' is present before assignment if possible, 
			// or assign a placeholder that prevents crashes.
			newConfigs['system'] = this.getSystemConfigDefault();
		}
		
		// Atomic swap
		this.configs = newConfigs;
		this.userIdToConfig = newUserIdToConfig;

		// Now run the standard loaders to fill in gaps (system, user, persona)
		// These will update this.configs in place, which is now safe because 'system' exists.
		await this.loadConfig( 'system' );
		await this.loadConfig( 'user' );
		await this.loadConfig( 'persona-awi' );

		return this.newAnswer(this.configs);
	}

	getSystemConfigDefault() {
		const RED = '\x1b[31m';
		const GREEN = '\x1b[32m';
		const BLUE = '\x1b[34m';
		const CYAN = '\x1b[36m';
		const WHITE = '\x1b[37m';
		const RESET = '\x1b[0m';
		
		return {
			prompts: {
				user: WHITE + '.(<°) ',
				awi: CYAN + '.(°°) ',
				result: BLUE + '.(..) ',
				information: BLUE + '.(oo) ',
				info: BLUE + '.(oo) ',
				question: WHITE + '.(?°) ',
				command: RED + '.(>°) ',
				root: CYAN + '.[oo] ',
				warning: RED + '.(OO) ',
				error: RED + '.(**) ',
				success: GREEN + '.(ok) ',
				code: BLUE + '.{..} ',
				debug1: BLUE + '.[??] ',
				debug2: BLUE + '.[??] ',
				debug3: BLUE + '.[??] ',
				verbose1: BLUE + '.(oo) ',
				verbose2: BLUE + '.(oo) ',
				verbose3: BLUE + '.[oo] ',
				verbose4: BLUE + '.[??] ',
				bubble: BLUE + '.(oo) ',
			},
			commands: {}
		};
	}

	async loadConfig( type, callback )
	{
		if ( type == 'user' )
		{
			if (this.userId && this.userIdToConfig[this.userId])
				return this.userIdToConfig[this.userId];
			if (this.user && this.configs[this.user])
				return this.configs[this.user];
			if (this.userId && this.awi.database)
			{
				var answer = await this.awi.database.getUserConfig({ userId: this.userId });
				if (answer.isSuccess())
				{
					this.userIdToConfig[this.userId] = answer.getValue();
					this.configs[this.user] = answer.getValue();
					return answer.getValue();
				}
			}
		}
		if ( type.indexOf( 'persona' ) == 0 )
		{
			if (this.userId && this.awi.database)
			{
				var personaName;
				if ( type.indexOf( '-' ) >= 0 )
					personaName = type.split('-')[1];
				if (!personaName){
					const userConfig = this.configs[this.user];
					if (userConfig)
						personaName = userConfig.persona;
				}
				if (this.configs['persona-' + personaName])
					return this.configs['persona-' + personaName];
				var answer = await this.awi.database.getNamedConfig({ userId: this.userId, type: 'personality', name: personaName });
				if (answer.isSuccess())
				{
					this.configs['persona-' + personaName] = answer.getValue();
					return answer.getValue();
				}
			}
		}

		if ( !this.configs[ type ] )
		{
			if ( type == 'system' )
			{
				this.configs[ 'system' ] = this.getSystemConfigDefault();
			}
			else if ( type == 'user' )
			{
				this.configs[ type ] =
				{
					firstName: '',
					lastName: '',
					fullName: '',
					awiName: 'User',
					userName: '',
					email:'',
					country: '',
					language: '',
					persona: 'awi',
					paths:{},
					directConnection: true,
					localServer: true,
					aiKey: '',
					isDegree: true,
					fix: 3,
					debug: 0,
					developperMode: true,
					verbose: 1,
					justify: 160,
					verbosePrompts:
					{
						verbose1: [],
						verbose2: [ 'bubble', 'info', 'information' ],
						verbose3: [],
						verbose4: [ 'debug1', 'debug2', 'debug3' ]
					},
					debugPrompts:
					{
						debug1: [ 'bubble' ],
						debug2: [ 'bubble', 'parser' ],
						debug3: []
					},
				};
			}
			else if ( type.indexOf('persona-') == 0 )
			{
				const RED = '\x1b[31m';
				const GREEN = '\x1b[32m';
				const BLUE = '\x1b[34m';
				const CYAN = '\x1b[36m';
				const WHITE = '\x1b[37m';

				this.configs[ type ] =
				{
					name: 'awi',
					token: '',
					temperature: 0.5,
					prompts:
					{
						user: WHITE + '.(<°) ',
						awi: CYAN + '.(°°) ',
						result: BLUE + '.(..) ',
						information: BLUE + '.(oo) ',
						info: BLUE + '.(oo) ',
						question: WHITE + '.(?°) ',
						command: RED + '.(>°) ',
						root: CYAN + '.[oo] ',
						warning: RED + '.(OO) ',
						error: RED + '.(**) ',
						success: GREEN + '.(ok) ',
						code: BLUE + '.{..} ',
						debug1: BLUE + '.[??] ',
						debug2: BLUE + '.[??] ',
						debug3: BLUE + '.[??] ',
						verbose1: BLUE + '.(oo) ',
						verbose2: BLUE + '.(oo) ',
						verbose3: BLUE + '.[oo] ',
					}
				};
			}
		}
		if ( callback )
			callback( this.configs[ type ] )
		return this.configs[ type ];
	}
	async getDefaultPaths()
	{
		var paths = {
			win32: {},
			darwin: {},
			linux: {},
			android: {},
			iOS: {}};
		var userDir = this.awi.system.getSystemInformation( 'userDir' );
		var drives = this.awi.system.getSystemInformation( 'drives' );
		for ( var d = 0; d < drives.length; d++ )
			drives[ d ] = drives[ d ] + ':/';
		var platform = this.awi.system.getSystemInformation( 'platform' );
		switch ( platform )
		{
			case 'win32':
				paths.win32.image = [ userDir + '/Pictures' ];
				paths.win32.sound = [];
				paths.win32.video = [ userDir + '/Videos' ];
				paths.win32.music = [ userDir + '/Music' ];
				paths.win32.document = [ userDir + '/Documents' ];
				paths.win32.presentation = [ userDir + '/Documents' ];
				paths.win32.json = [];
				paths.win32.source = [];
				paths.win32.application = [ 'C:/Program Files', 'C:/Program Files (x86)' ];
				paths.win32.accessory = [ 'C:/AOZ_Studio/AOZ_Studio/aoz/app/aozacc' ];
				paths.win32.dev = [ 'd:/development/awi' ];
				paths.win32.file = drives;
				break;
			case 'darwin':
				break;
			case 'linux':
				break;
			case 'android':
				break;
			case 'iOS':
				break;
		}
		return paths;
	}
	getPrompt( type, options = {} )
	{
		type = ( typeof type == 'undefined' ? 'awi' : type );
		const RED = '\x1b[31m';

		// 1. Hardcoded System Prompts (Always show, for critical internal errors)
		if ( type == 'systemwarning' ) return RED + '.(OO) Warning: ';
		if ( type == 'systemerror' ) return RED + '.(**) ERROR! ';
		
		var userConfig = (this.user && this.configs[this.user]) ? this.configs[this.user] : this.configs['user'];
		var verboseLevel = userConfig ? userConfig.verbose : 1;
		var debugLevel = userConfig ? userConfig.debug : 0;

		// Check for verbose override in options
		if ( typeof options.verbose != 'undefined' )
		{
			// If options.verbose is higher or equal to the requirement, we might force it?
			// Actually, the logic below checks if CURRENT level < REQUIRED level.
			// The user request says: "if defined, use the given one instead of the default one."
			// meaning use options.verbose as the 'current' verboseLevel for this check.
			verboseLevel = options.verbose;
		}

		// 2. Check if this type is controlled by Verbosity Settings
		if ( userConfig && userConfig.verbosePrompts )
		{
			// Find which level controls this type
			var requiredVerboseLevel = 0;
			for ( var v = 1; v <= 4; v++ )
			{
				if ( userConfig.verbosePrompts['verbose' + v] && userConfig.verbosePrompts['verbose' + v].includes(type) )
				{
					requiredVerboseLevel = v;
					break;
				}
			}

			// If it is controlled
			if ( requiredVerboseLevel > 0 )
			{
				// If current level is too low, hide it
				if ( verboseLevel < requiredVerboseLevel ) {
					return null;
				}
			}
		}
		
		// 3. Check if this type is controlled by Debug Settings
		// Handle 'debugN' types specifically
		if ( type.indexOf( 'debug' ) == 0 )
		{
			// If verbose override is 4 (Debug), always show debug messages
			if ( verboseLevel >= 4 )
			{
				// Allowed
			}
			else
			{
				var level = parseInt( type.substring( 5 ) );
				// If it's literally "debug1", "debug2", etc.
				if ( !isNaN(level) )
				{
					if ( debugLevel >= level )
					{
						// Allowed, proceed to fetch string
					}
					else
					{
						return null;
					}
				}
			}
		}
		// Check debugPrompts list for non-debugN names
		if ( userConfig && userConfig.debugPrompts )
		{
			var requiredDebugLevel = 0;
			for ( var d = 1; d <= 3; d++ )
			{
				if ( userConfig.debugPrompts['debug' + d] && 
					 (userConfig.debugPrompts['debug' + d].includes(type) || userConfig.debugPrompts['debug' + d].includes('all')) )
				{
					requiredDebugLevel = d;
					break;
				}
			}
			if ( requiredDebugLevel > 0 )
			{
				if ( debugLevel < requiredDebugLevel ) {
					return null;
				}
			}
		}

		// 4. Retrieve Prompt String (Persona Override -> System Default)
		// If we reached here, it means we are allowed to show it (or it's not restricted).

		// Persona Override
		if ( this.user && this.configs[ this.user ] )
		{
			var config = this.configs[ 'persona-' + userConfig.persona ];
			if ( config && config.prompts && config.prompts[ type ] )
				return config.prompts[ type ];
		}

		// System Standard
		if ( this.configs.system && this.configs.system.prompts && this.configs.system.prompts[type] )
			return this.configs.system.prompts[type];

		// 5. Not found -> Hide
		return RED + '.(BUG!) ';
	}
	getConfigTypes( type )
	{
		var result = { originalType: type, type: '', userId: null };
		var pos = type.indexOf( '-' );
		if ( pos >= 0 )
			result.originalType = type.substring( 0, pos );
		if ( type == 'user' )
		{
			type = this.user;
			if ( type == '' )
				type = 'user-default';
		}
		else if ( type == 'persona' )
		{
			const userConfig = this.configs[this.user];
			if (userConfig) {
				type = 'persona-' + userConfig.persona;
				result.userId = userConfig.userId;
			} else {
				type = 'persona-persona';
			}
		}
		result.type = type;
		return result;
	}
	getUser()
	{
		return this.user;
	}
	getUserKey()
	{
		var config = this.getConfig( 'user' );
		if ( config )
			return config.aiKey;
		return '';
	}
	setVerbose( verbose )
	{
		const config = this.getConfig( 'user' );
		if (config) {
			config.verbose = Math.max( Math.min( 4, verbose ), 1 );
		}
	}
	getSystem()
	{
		return this.configs[ 'system' ];
	}
	getDebug()
	{
		return this.getConfig( 'user' ).debug;
	}
	setDebug( debug )
	{
		if ( this.getConfig( 'user' ).debug != debug )
		{
			if ( debug >= 0 && debug <= 3 )
				this.getConfig( 'user' ).debug = debug;
		}
	}

	// Exposed functions
	async setUser( args, basket, control )
	{
		if (control && control.editor) control.editor.print('Configuration: setUser called...', { user: 'debug1', verbose: 4 });
		var { userName, userId } = this.awi.getArgs( [ 'userName', 'userId' ], args, basket, [ '', null ] );
		userName = userName.trim();
		if (!userName)
		{
			this.user = '';
			this.userId = null;
			return this.newAnswer( true );
		}

		var config;
		if ( this.userIdToConfig[userId] )
		{
			this.user = userName;
			this.userId = userId;
			config = this.userIdToConfig[userId];
		}
		else if ( this.configs[userName] )
		{
			this.user = userName;
			config = this.configs[userName];
			this.userId = config.userId;
		}
		if ( config )
		{
			if (control && control.editor) control.editor.print('Configuration: User config found, loading persona...', { user: 'debug1', verbose: 4 });
			var persona = await this.loadConfig( 'persona-' + config.persona );
			if (control && control.editor) control.editor.print('Configuration: Persona loaded.', { user: 'debug1', verbose: 4 });
			return this.newAnswer( {
				configuration: {
					config: config,
					name: config.awiName,
					persona: persona }
			}
			);
		}
		if (control && control.editor) control.editor.print('Configuration: User config NOT found.', { user: 'debug1', verbose: 4 });
		return this.newError( { message: 'awi:user-config-not-found', data: userName } );
	}
}
