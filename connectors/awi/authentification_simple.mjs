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
* @file authentification.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short English language parser based on Compromise
*
*/
import ConnectorBase from '../../connector.mjs'
import crypto from 'crypto'
export { ConnectorAuthentification_Simple as Connector }

class ConnectorAuthentification_Simple extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Authentification Simple';
		this.token = 'authentification';
		this.className = 'ConnectorAuthentification_Simple';
		this.group = 'awi';
		this.version = '0.5';
		this.accounts = {};
	}
	async connect()
	{
		var answer = await this.loadAccounts();
		return this.setConnected( answer.isSuccess() );
	}
	async createAccount(parameters)
	{
		if ( !parameters.password )
			return this.newError( { message: 'awi:missing-password' } );
		if ( this.accounts[ parameters.userName ] )
			return this.newError( { message: 'awi:account-already-exist', data: parameters.userName } );
		this.accounts[ parameters.userName ] = {
			userName: parameters.userName,
			password: parameters.password,
			loggedIn: false,
			loggedInAwi: false,
			key: null,
			awiInfo: null
		};
		var answer = await this.saveAccounts();
		if (!answer.isSuccess())
			return this.newError( { message: 'awi:error-when-creating-user', data: parameters.userName } );
		return this.newAnswer({ userName: parameters.userName });
	}
	async loginAccount(parameters)
	{
		// Stupid check for the moment
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (account.password != parameters.password)
			return this.newError( { message: 'awi:wrong-password', data: parameters.userName } );
		account.loggedIn = true;
		account.key = crypto.randomBytes(64).toString('hex');
		
		// Get mapped username once
		const userNameMapped = this.awi.edhttp?.mapUserName(parameters.userName) || parameters.userName;
		
		// Notify all connectors that user has logged in
		await this.awi.callConnectors(
			['onUserLogin', '*', { 
				userName: parameters.userName,
				userNameMapped: userNameMapped
			}],
			{},
			{}
		);
		
		return this.newAnswer( { userName: account.userName, key: account.key } );
	}
	async logoutAccount(parameters)
	{
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (!account.loggedIn)
			return this.newError( { message: 'awi:account-not-logged-in', data: parameters.userName } );
		
		// Get mapped username once
		const userNameMapped = this.awi.edhttp?.mapUserName(parameters.userName) || parameters.userName;
		
		// Notify all connectors that user is logging out (before actual logout)
		await this.awi.callConnectors(
			['onUserLogout', '*', { 
				userName: parameters.userName,
				userNameMapped: userNameMapped
			}],
			{},
			{}
		);
		
		if ( account.loggedInAwi )
			this.logoutAwi( { userName: parameters.userName } );
		account.loggedIn = false;
		account.key = null;
		return this.newAnswer( { userName: parameters.userName } );
	}
	async getUserList( parameters )
	{
		var answer = await this.loadAccounts();
		if ( answer.isError() )
			return answer;
		var accounts = answer.data;
		var users = [];
		for ( var userName in accounts )
			users.push( userName );
		return this.newAnswer( users );
	}
	async createAwiAccount( parameters )
	{
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (!account.loggedIn)
			return this.newError( { message: 'awi:account-not-logged-in', data: parameters.userName } );

		var config = this.awi.configuration.checkUserConfig( parameters.userName );
		if ( config )
			return this.newError( { message: 'awi:awi-account-already-exist', data: parameters.userName } );

		config = this.awi.configuration.getNewUserConfig();
		config.firstName = parameters.firstName;
		config.lastName = parameters.lastName;
		config.fullName = parameters.firstName + ' ' + parameters.lastName;
		config.userName = parameters.userName;
		config.email = parameters.email;
		config.country = parameters.country;
		config.language = parameters.language;
		this.awi.configuration.setNewUserConfig( config.userName, config );
		var answer = await this.awi.configuration.saveConfigs();
		if ( answer.isSuccess() )
			return this.newAnswer( { userName: parameters.userName } );
		return this.newError( { message: 'awi:error-when-creating-user', data: parameters.userName } );
	}
	async loginAwi( parameters )
	{
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (!account.loggedIn)
			return this.newError( { message: 'awi:account-not-logged-in', data: parameters.userName } );
		if ( account.loggedInAwi )
			return this.newError( { message: 'awi:account-already-logged-in', data: parameters.userName } );

		var answer = await this.awi.callConnectors( [ 'setUser', '*', { userName: parameters.userName } ], {}, {} );
		if ( answer.isError() )
			return answer;
		if ( parameters.configs )
			this.awi.configuration.setSubConfigs( parameters.configs );
		account.loggedInAwi = true;
		return this.newAnswer({ userName: parameters.userName });
	}
	async logoutAwi( parameters )
	{
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (!account.loggedIn)
			return this.newError( { message: 'awi:account-not-logged-in', data: parameters.userName } );
		if (!account.loggedInAwi)
			return this.newError( { message: 'awi:account-not-logged-in-awi', data: parameters.userName } );

		account.loggedInAwi = false;
		return this.newAnswer({ userName: parameters.userName });
	}
	async deleteAccount(parameters)
	{
		if ( !this.accounts[parameters.userName] )
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		var answer = this.logoutAccount( parameters );
		if ( answer.isError() )
			return answer;
		delete this.accounts[parameters.userName];
		var answer = await this.saveAccounts();
		if (!answer.isSuccess())
			return answer;
		return this.newAnswer({ userName: parameters.userName });
	}
	async getUserInfo(parameters)
	{
		var account = this.accounts[parameters.userName];
		if (!account)
			return this.newError( { message: 'awi:account-not-found', data: parameters.userName } );
		if (!account.loggedIn)
			return this.newError( { message: 'awi:account-not-logged-in', data: parameters.userName } );
		return this.newAnswer({ accountInfo: account });
	}

	///////////////////////////////////////////////////////////////////////
	async saveAccounts()
	{
		var path = this.awi.configuration.getConfigurationPath();
		var json = JSON.stringify( this.accounts );
		var jsonEncrypted = this.awi.utilities.encrypt( json );
		return await this.awi.files.saveText( path + '/accounts.dat', jsonEncrypted );
	}
	async loadAccounts()
	{
		var path = this.awi.configuration.getConfigurationPath() + '/accounts.dat';
		var answer = this.awi.files.exists( path );
		if (answer.isError())
			return this.newAnswer({});
		var jsonEncrypted = await this.awi.files.loadText( path );
		if (!jsonEncrypted.isSuccess())
			return this.newError( { message: 'awi:error-when-loading-accounts', data: path } );
		var json = this.awi.utilities.decrypt( jsonEncrypted.data );
		try
		{
			this.accounts = JSON.parse( json );
		}
		catch( e )
		{
			return this.newError( { message: 'awi:error-when-loading-accounts', data: e } );
		}
		return this.newAnswer(this.accounts);
	}
}
