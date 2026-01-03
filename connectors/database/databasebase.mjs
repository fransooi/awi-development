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
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file databasebase.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Database connector base class.
*
*/
import ConnectorBase from '../../connector.mjs'
export default class ConnectorDatabaseBase extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'ConnectorDatabaseBase';
		this.group = 'database';
		this.version = '0.5';
	}
	async connect( options )
	{
		super.connect( options );
	}
	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;
		var data = {};
		data[ this.token ] = {
			self: this,
			version: this.version,
			commands: {}
		}
		return data;
	}
	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( { message: 'awi:command-not-found', data: message.command }, { stack: new Error().stack, functionName: 'command' } ), message, editor );
	}
}
