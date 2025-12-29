/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \      / ][   ]       Programmable
*     _/ /   \ \_\  \/ \/  / |  |        Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_]      link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file connector.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Connector base class
*
*/
import ConnectorBase from './connector.mjs'

export default class ConnectorEditor extends ConnectorBase
{
	constructor( awi, config = {}, data = {} )
	{
		super( awi, config, data );
		this.version = '0.5';
		this.className = 'ConnectorEditor';
		this.name = 'Connector Editor';
	}
	async connect( options )
	{
		return super.connect( options );
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
 	replyWarning( warning, message, editor )
	{
		if (editor)
			editor.reply( { warning: warning.getPrint() }, message );
		return warning;
	}
	async command( message, editor )
	{
		if (this[ 'command_' + message.command ])
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( 'awi:command-not-found', message.command ), message, editor );
	}
}

