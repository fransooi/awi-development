/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\_\_/\_\_/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file drivebase.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Drive connector base class.
*
*/
import ConnectorBase from '../../connector.mjs'
import { v4 as uuidv4 } from 'uuid';

export default class ConnectorDriveBase extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'ConnectorDriveBase';
		this.group = 'drive';
		this.version = '0.5';
		this.userId = null;
		this.userName = null;
		this.token = null;
	}

	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
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

	async setUser(args, basket, control)
	{
		if (args.userId) {
			this.userId = args.userId;
		}
		if (args.userName) {
			this.userName = args.userName;
		}
		return this.newAnswer(true);
	}

	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( { message: 'awi:command-not-found', data: message.command }, { stack: new Error().stack } ), message, editor );
	}

	// Common command implementations for all drive connectors

	async command_listFiles(parameters, message, editor)
	{
		parameters.folderId = parameters.folderId || 'root';
		parameters.query = parameters.query || null;
		parameters.limit = parameters.limit || 100;
		const files = await this._listFiles(parameters);
		if (files.isError())
			return this.replyError(files, message, editor);
		return this.replySuccess(files, message, editor);
	}

	async command_getFile(parameters, message, editor)
	{
		const file = await this._getFile(parameters);
		if (file.isError())
			return this.replyError(file, message, editor);
		return this.replySuccess(file, message, editor);
	}

	async command_downloadFile(parameters, message, editor)
	{
		const result = await this._downloadFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_uploadFile(parameters, message, editor)
	{
		const file = await this._uploadFile(parameters);
		if (file.isError())
			return this.replyError(file, message, editor);
		return this.replySuccess(file, message, editor);
	}

	async command_createFolder(parameters, message, editor)
	{
		const folder = await this._createFolder(parameters);
		if (folder.isError())
			return this.replyError(folder, message, editor);
		return this.replySuccess(folder, message, editor);
	}

	async command_deleteFile(parameters, message, editor)
	{
		const result = await this._deleteFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_renameFile(parameters, message, editor)
	{
		const result = await this._renameFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_moveFile(parameters, message, editor)
	{
		const result = await this._moveFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_searchFiles(parameters, message, editor)
	{
		const files = await this._searchFiles(parameters);
		if (files.isError())
			return this.replyError(files, message, editor);
		return this.replySuccess(files, message, editor);
	}

	async command_watchFolder(parameters, message, editor)
	{
		const result = await this._watchFolder(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	// These methods should be implemented by derived classes
	async _listFiles(parameters)
	{
		throw new Error('_listFiles not implemented in ' + this.className);
	}

	async _getFile(parameters)
	{
		throw new Error('_getFile not implemented in ' + this.className);
	}

	async _downloadFile(parameters)
	{
		throw new Error('_downloadFile not implemented in ' + this.className);
	}

	async _uploadFile(parameters)
	{
		throw new Error('_uploadFile not implemented in ' + this.className);
	}

	async _createFolder(parameters)
	{
		throw new Error('_createFolder not implemented in ' + this.className);
	}

	async _deleteFile(parameters)
	{
		throw new Error('_deleteFile not implemented in ' + this.className);
	}

	async _renameFile(parameters)
	{
		throw new Error('_renameFile not implemented in ' + this.className);
	}

	async _moveFile(parameters)
	{
		throw new Error('_moveFile not implemented in ' + this.className);
	}

	async _searchFiles(parameters)
	{
		throw new Error('_searchFiles not implemented in ' + this.className);
	}

	async _watchFolder(parameters)
	{
		throw new Error('_watchFolder not implemented in ' + this.className);
	}

	// Utility methods for all drive connectors

	_generateId()
	{
		return uuidv4();
	}

	_createStandardFile(data = {})
	{
		return {
			id: data.id || this._generateId(),
			name: data.name || 'Untitled',
			mimeType: data.mimeType || 'application/octet-stream',
			size: data.size || 0,
			createdTime: data.createdTime || new Date().toISOString(),
			modifiedTime: data.modifiedTime || new Date().toISOString(),
			isFolder: data.isFolder || false,
			parentId: data.parentId || null,
			webViewLink: data.webViewLink || null,
			webContentLink: data.webContentLink || null,
			thumbnailLink: data.thumbnailLink || null,
			source: this.token || 'unknown'
		};
	}
	_createStandardFolder(data = {})
	{
		return {
			...this._createStandardFile(data),
			isFolder: true,
			mimeType: 'application/vnd.google-apps.folder'
		};
	}
}
