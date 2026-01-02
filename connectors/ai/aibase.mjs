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
* @file aibase.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Base connector, handle a conversation
*
*/
import ConnectorBase from '../../connector.mjs'

export default class ConnectorAIBase extends ConnectorBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'Ai Base';
		this.token = 'aibase';
		this.group = 'ai';
		this.className = 'ConnectorAIBase';
		this.version = '0.5';
		this.user = '';
		this.configuration = {};
	}
	async connect( options )
	{
		super.connect( options );
		for ( var option in options )
			this.configuration[ option ] = options[ option ];
		if ( this.configuration.aiKey == 'root' )
		{
			if ( this.awi.awi && this.awi.awi.aichat && this.awi.awi.aichat.configuration )
				this.configuration.aiKey = this.awi.awi.aichat.configuration.aiKey;
		}
	}
	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;
		var data = {};
		data[ this.token ] =
		{
			self: this,
			version: this.version,
			commands: {}
		}
		return data;
	}
	async setUser( args, basket, control )
	{
		var { userName, awiName } = this.awi.getArgs( [ 'userName', 'awiName' ], args, basket, [ '', '' ] );
		if (!userName || !awiName)
		{
			this.awiName = '';
			this.user = '';
			return this.newAnswer( true );
		}
		if (!this.awi.configuration.getConfig(userName))
			return this.newError({ message: 'awi:user-not-found', data: userName }, { functionName: 'setUser' });
		if ( !this.user || userName != this.user )
		{
			this.awiName = awiName;
			this.user = userName;

			// Sync AI Key if present in user config
			if (this.awi.configuration.getConfig(userName).aiKey) {
				this.configuration.aiKey = this.awi.configuration.getConfig(userName).aiKey;
			}
		}
		return this.newAnswer( true );
	}
}
