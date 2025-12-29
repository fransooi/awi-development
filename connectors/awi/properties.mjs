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
* @file properties.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Management of saveable properties
*
*/
import ConnectorBase from '../../connector.mjs'
export { ConnectorProperties as Connector }

class ConnectorProperties extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Properties';
		this.token = 'properties';
		this.className = 'ConnectorProperties';
		this.group = 'awi';
		this.version = '0.5';
		this.propertiesPath = '';
	}
	async connect( options )
	{
		super.connect( options );
		this.propertiesPath = options.propertiesPath == 'root' ? this.awi.awi.thinknotes.propertiesPath : options.propertiesPath;
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;
		this.templatesUrl = this.editor.templatesUrl || this.templatesUrl;
		this.projectsUrl = this.editor.projectsUrl || this.projectsUrl;
		this.runUrl = this.editor.runUrl || this.runUrl;

		var data = {};
		data[ this.token ] = {
			self: this,
			version: this.version,
			commands: {
				getPropertiesList: this.command_getPropertiesList.bind(this),
				loadProperties: this.command_loadProperties.bind(this),
				saveProperties: this.command_saveProperties.bind(this),
				deleteProperties: this.command_deleteProperties.bind(this),
				renameProperties: this.command_renameProperties.bind(this),
				parseMetadata: this.command_parseMetadata.bind(this),
			}
		}
		return this.newAnswer( data );
	}
	async createAccount( parameters, basket, control )
	{
		var propertyPath = this.propertiesPath + '/' + parameters.userName;
		return await this.awi.files.createDirectories( propertyPath );
	}
	parseMetadata( metadata, parent = {} )
	{
		for ( var m = 0; m < metadata.length; m++ )
		{
			var option = metadata[m];
			if ( option.type == 'group' )
			{
				if (this.awi.utilities.isObject(parent))
					parent = {...parent, ...this.parseMetadata( option.data, parent )};
				else {
					parent.push( this.parseMetadata( option.data, {} ) );
				}
			}
			else if ( option.type == 'grouparray' )
			{
				if ( !parent[ option.key ] )
					parent[ option.key ] = [];
				this.parseMetadata( option.data, parent[ option.key ] );
			}
			else if (option.type != 'separator')
				parent[ option.key ] = option.defaultValue;
		}
		return parent;
	}
	async command_parseMetadata(parameters, message, editor)
	{
		return this.replySuccess( this.newAnswer( this.parseMetadata( parameters.metadata ) ), message, editor );
	}
	async command_getPropertiesList(parameters, message, editor)
	{
		var propertiesPath = this.propertiesPath + '/' + this.userName;
		var answer = await this.awi.system.exists( propertiesPath );
		if ( answer.isError() )
			return this.replySuccess( this.newAnswer( [] ), message, editor );
		var filter = parameters.filter ? parameters.filter : 'props_*.json';
		answer = await this.awi.files.getDirectory( propertiesPath, { recursive: false, listFiles: true, listDirectories: false, filters: filter, noStats: true } );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		var files = answer.data;
		var properties = [];
		for ( var f = 0; f < files.length; f++ )
		{
			var file = files[ f ];
			var name = file.name.substring( 5, file.name.length - 5 );
			name = name.substring( 0, name.lastIndexOf( '.' ) );
			properties.push( name );
		}
		return this.replySuccess( this.newAnswer( properties ), message, editor );
	}
	async command_loadProperties(parameters, message, editor)
	{
		var propertyPath = this.propertiesPath + '/' + this.userName;
		var answer = await this.awi.files.createDirectory( propertyPath );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		answer = await this.awi.files.loadJSON( propertyPath + '/props_' + parameters.name + '.json' );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		return this.replySuccess( this.newAnswer( answer.data ), message, editor );
	}
	async command_saveProperties(parameters, message, editor)
	{
		var propertyPath = this.propertiesPath + '/' + this.userName;
		var answer = await this.awi.files.createDirectory( propertyPath );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		answer = await this.awi.files.saveJSON( propertyPath + '/props_' + parameters.name + '.json', parameters.properties );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		return this.replySuccess( this.newAnswer( answer.data ), message, editor );
	}
	async command_deleteProperties(parameters, message, editor)
	{
		var answer = await this.awi.files.deleteFile( this.propertiesPath + '/' + this.userName + '/props_' + parameters.name + '.json' );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		return this.replySuccess( this.newAnswer( answer.data ), message, editor );
	}
	async command_renameProperties(parameters, basket, control)
	{
		var answer = await this.awi.files.renameFile( this.propertiesPath + '/' + this.userName + '/props_' + parameters.name + '.json', this.propertiesPath + '/' + this.userName + '/props_' + parameters.newName + '.json' );
		if ( answer.isError() )
			return this.replyError( answer, message, editor );
		return this.replySuccess( this.newAnswer( answer.data ), message, editor );
	}
}
