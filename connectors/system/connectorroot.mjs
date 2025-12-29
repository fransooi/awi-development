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
* @file rootconnector.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Root connector
*/
import ConnectorBase from '../../connector.mjs'

export { ConnectorRoot as Connector }

export default class ConnectorRoot extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.token = config.token || 'connectorroot';
		this.parentConnector = this.awi.awi[ this.token ];
		if ( this.parentConnector )
		{
			this.name = this.parentConnector.name;
			this.className = this.parentConnector.className;
			this.group = this.parentConnector.group;
			this.version = this.parentConnector.version;

			// Poke all server commands as functions.
			var parent = this.parentConnector;

			// Copy own function properties from the instance (if any)
			Object.getOwnPropertyNames( parent ).forEach( ( name ) =>
			{
				if ( name === 'constructor' )
				{
					return;
				}
				var desc = Object.getOwnPropertyDescriptor( parent, name );
				var isFunc = desc && typeof desc.value === 'function';
				if ( isFunc && !this[ name ] )
				{
					this[ name ] = ( ...args ) => this.parentConnector[ name ]( ...args );
				}
			} );

			// Walk the prototype chain to copy class methods (non-enumerable)
			var stopProto = ConnectorBase.prototype;
			var proto = Object.getPrototypeOf( parent );
			while ( proto && proto !== stopProto && proto !== Object.prototype )
			{
				Object.getOwnPropertyNames( proto ).forEach( ( name ) =>
				{
					if ( name === 'constructor' )
					{
						return;
					}
					var desc = Object.getOwnPropertyDescriptor( proto, name );
					if ( desc && typeof desc.value === 'function' && !this[ name ] )
					{
						this[ name ] = ( ...args ) => this.parentConnector[ name ]( ...args );
					}
				} );
				proto = Object.getPrototypeOf( proto );
			}
		}
	}
	connect()
	{
		return this.setConnected( true );
	}
	quit()
	{
	}
}
