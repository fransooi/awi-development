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
* @file deported.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Deported editor connector: makes the link with any editor
*
*/
import ConnectorBase from '../../connector.mjs'
import { Ed as EdCommandLine } from './ed-commandline.mjs';
import { Ed as EdWebSocket } from './ed-websocket.mjs';
import { Ed as EdHttp } from './ed-http.mjs';
export { ConnectorEditor as Connector }

class ConnectorEditor extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Editor';
		this.token = 'editor';
		this.className = 'ConnectorEditor';
		this.group = 'editor';
		this.version = '0.5';
		this.editors = {};
		this.current = null;
	}
	async connect( options )
	{
		super.connect( options );
		var error = false;
		if ( options.editors )
		{
			for ( var e in options.editors )
			{
				var answer = this.addEditor( e, options.editors[e] );
				if ( answer.isSuccess() )
				{
					if ( e == 'commandline')
						this.current = answer.data.editor;
				}
				else
					error = true;
			}
		}
		return this.setConnected( !error );
	}
	addEditor( editor, config = {} )
	{
		var handleName = 'editor';
		if ( typeof editor == 'string' )
		{
			handleName = editor;
			config.parent = this;
			editor = editor.toLowerCase();
			if ( editor == 'commandline' )
				editor = new EdCommandLine( this.awi, config );
			else if ( editor == 'websocket' )
				editor = new EdWebSocket( this.awi, config );
			else if ( editor == 'http' )
				editor = new EdHttp( this.awi, config );
		}
		if ( !editor )
			return;

		this[ editor.handle ] = editor;
		this.editors[ editor.handle ] = editor;
		return this.newAnswer( { editor: editor, handle: editor.handle } );
	}
	connectEditors( config = {} )
	{
		for ( var e in this.editors )
			this.editors[ e ].connect(config.connectConfig || {});
	}
	getEditor( handle )
	{
		return this[ handle ];
	}
	close( editor )
	{
		if ( typeof editor == 'string' )
			editor = this[ editor ];
		if ( !editor )
			return;

		editor.close();
		delete this.editors[ editor.handle ];
		delete this[ editor.handle ];
		if ( this.current == editor )
			this.current = null;
	}

	// Exposed functions
	async print( args, control )
	{
		var text = this.awi.utilities.isObject( args ) ? args.text : args;
		if ( this.current )
			await this.current.print( text, control );
	}
	async setUser( args, basket, control )
	{
		for ( var e in this.editors )
			this.editors[ e ].setUser( args, basket, control );
		return this.newAnswer(true);
	}
	setPrompt( prompt )
	{
		if ( this.current )
			this.current.setPrompt( prompt );
	}
	rerouteInput( route )
	{
		if ( this.current )
			this.current.rerouteInput( route );
	}
	disableInput( )
	{
		if ( this.current )
			this.current.disableInput();
	}
	saveInputs()
	{
		if ( this.current && this.current.saveInputs)
			this.current.saveInputs();
	}
	restoreInputs( editor )
	{
		if ( this.current && this.current.restoreInputs)
			this.current.restoreInputs( editor );
	}
	waitForInput( options = {} )
	{
		if ( this.current )
			this.current.waitForInput( options );
	}
	sendMessage( command, parameters, callback )
	{
		if ( this.current )
			this.current.sendMessage( command, parameters, callback );
	}
	addDataToReply( name, data )
	{
		if ( this.current && this.current.addDataToReply)
			this.current.addDataToReply( name, data );
	}
}
