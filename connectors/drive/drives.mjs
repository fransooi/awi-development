/** --------------------------------------------------------------------------
*
*            / \
*          / _ \               (°°)       Intelligent
*        / ___ \ [ \ [ \  [ \ [   ]       Programmable
*     _/ /   \ \_\  \/\ \/ /  |  | \      Personal
* (_)|____| |____|\_\_/\_\_/  [_| |_] \     Assistant
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file drives.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Drives connector: aggregates multiple drive providers
*
*/
import ConnectorBase from '../../connector.mjs'
import { Connector as ConnectorDriveGoogle } from './drivegoogle.mjs';

export { ConnectorDrives as Connector }

class ConnectorDrives extends ConnectorBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Drives';
		this.token = 'drives';
		this.className = 'ConnectorDrives';
		this.group = 'drive';
		this.version = '0.5';
		this.drives = {};
		this.current = null;
		this.userId = null;
		this.userName = null;
	}

	async connect(options)
	{
		super.connect(options);
		var error = false;
		for (var e in options.drives)
		{
			var answer = await this.addDrive(e, options.drives[e].config, options.drives[e].options);
			this.connectMessage += '\n' + answer.getPrint();
			error |= answer.isError();
		}
		return this.setConnected(!error);
	}

	async addDrive(drive, config = {}, options = {})
	{
		try
		{
			if (typeof drive == 'string')
			{
				config.parent = this;
				drive = drive.toLowerCase();
				if (drive == 'google')
					drive = new ConnectorDriveGoogle(this.awi, config);
			}
		}
		catch (error)
		{
			return this.newError( { message: 'awi:cannot-add-drive', data: drive }, { functionName: 'command_addDrive' } );
		}
		if (!drive)
			return this.newError( { message: 'awi:drive-not-found', data: drive }, { functionName: 'command_addDrive' } );

		var answer = await drive.connect( options );
		if (answer.isError())
			return answer;
		this[drive.token] = drive;
		this.drives[drive.token] = drive;
		return answer;
	}

	getDrive(handle)
	{
		return this[handle];
	}

	close(drive)
	{
		if (typeof drive == 'string')
			drive = this[drive];
		if (!drive)
			return;

		drive.close();
		delete this.drives[drive.token];
		delete this[drive.token];
		if (this.current == drive)
			this.current = null;
	}

	async setUser(args, basket, control)
	{
		if (args.userId)
			this.userId = args.userId;
		if (args.userName)
			this.userName = args.userName;
		for (var e in this.drives)
			this.drives[e].setUser(args, basket, control);
		return this.newAnswer(true);
	}

	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;
		var data = {};
		data[this.token] =
		{
			self: this,
			version: this.version,
			commands: {}
		};

		// Register all commands
		data[this.token].commands.listFiles = this.command_listFiles.bind(this);
		data[this.token].commands.getFile = this.command_getFile.bind(this);
		data[this.token].commands.downloadFile = this.command_downloadFile.bind(this);
		data[this.token].commands.uploadFile = this.command_uploadFile.bind(this);
		data[this.token].commands.createFolder = this.command_createFolder.bind(this);
		data[this.token].commands.deleteFile = this.command_deleteFile.bind(this);
		data[this.token].commands.renameFile = this.command_renameFile.bind(this);
		data[this.token].commands.moveFile = this.command_moveFile.bind(this);
		data[this.token].commands.searchFiles = this.command_searchFiles.bind(this);
		data[this.token].commands.watchFolder = this.command_watchFolder.bind(this);
		data[this.token].commands.searchAllDrives = this.command_searchAllDrives.bind(this);
		data[this.token].commands.copyFileBetweenDrives = this.command_copyFileBetweenDrives.bind(this);
		data[this.token].commands.moveFileBetweenDrives = this.command_moveFileBetweenDrives.bind(this);

		return this.newAnswer( data );
	}

	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( { message: 'awi:command-not-found', data: message.command }, { functionName: 'command' } ), message, editor );
	}

	// Parse pathname format: "drivename:/path/to/file"
	_parsePathname(pathname)
	{
		const match = pathname.match(/^([^:]+):(.*)$/);
		if (match)
		{
			return {
				driveName: match[1].toLowerCase(),
				path: match[2]
			};
		}
		// If no drive specified, use first available
		return {
			driveName: Object.keys(this.drives)[0],
			path: pathname
		};
	}

	// Get drive by name or token
	_getDriveByName(driveName)
	{
		// Try exact match first
		if (this.drives[driveName])
		{
			return this.drives[driveName];
		}

		// Try with "drive" prefix
		const driveToken = `drive${driveName}`;
		if (this.drives[driveToken])
		{
			return this.drives[driveToken];
		}

		return null;
	}

	async command_listFiles(parameters, message, editor)
	{
		let targetDrive;
		let folderId = parameters.folderId || 'root';

		if (parameters.pathname)
		{
			const parsed = this._parsePathname(parameters.pathname);
			targetDrive = this._getDriveByName(parsed.driveName);
			// TODO: Convert path to folderId
		}
		else if (parameters.source)
			targetDrive = this.drives[parameters.source];
		else
			targetDrive = Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:no-drive-available' }, { functionName: 'command_listFiles' } ), message, editor);

		const result = await targetDrive.command_listFiles(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_getFile(parameters, message, editor)
	{
		if (!parameters.source)
		{
			for (const drive of Object.values(this.drives))
			{
				const result = await drive.command_getFile(parameters);
				if (result.isSuccess())
					return this.replySuccess(result, message, editor);
			}
			return this.replyError(this.newError( { message: 'awi:file-not-found', data: parameters.path }, { functionName: 'command_getFile' } ), message, editor);
		}

		var targetDrive = this.drives[parameters.source];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_getFile' } ), message, editor);
		const result = await targetDrive.command_getFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_downloadFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_downloadFile' } ), message, editor);

		const result = await targetDrive.command_downloadFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_uploadFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_uploadFile' } ), message, editor);

		const result = await targetDrive.command_uploadFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_createFolder(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_createFolder' } ), message, editor);

		const result = await targetDrive.command_createFolder(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_deleteFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_deleteFile' } ), message, editor);

		const result = await targetDrive.command_deleteFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_deleteFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_deleteFile' } ), message, editor);

		const result = await targetDrive.command_deleteFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_renameFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_renameFile' } ), message, editor);

		const result = await targetDrive.command_renameFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_moveFile(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_moveFile' } ), message, editor);

		const result = await targetDrive.command_moveFile(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_searchFiles(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.source }, { functionName: 'command_searchFiles'} ), message, editor);

		const result = await targetDrive.command_searchFiles(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_watchFolder(parameters, message, editor)
	{
		let targetDrive = parameters.source ? this.drives[parameters.source] : Object.values(this.drives)[0];
		if (!targetDrive)
			return this.replyError(this.newError( { message: 'awi:no-drive-available', data: parameters.source }, { functionName: 'command_watchFolder' } ), message, editor);

		const result = await targetDrive.command_watchFolder(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_searchAllDrives(parameters, message, editor)
	{
		const allFiles = [];
		const promises = Object.values(this.drives).map(async (drive) => {
			const result = await drive.command_searchFiles(parameters);
			if (result.isSuccess())
				return result.data;
			return [];
		});
		const results = await Promise.all(promises);
		results.forEach(files => {
			if (Array.isArray(files))
			{
				allFiles.push(...files);
			}
		});
		allFiles.sort((a, b) => {
			return new Date(b.modifiedTime) - new Date(a.modifiedTime);
		});
		return this.replySuccess(this.newAnswer(allFiles), message, editor);
	}

	async command_copyFileBetweenDrives(parameters, message, editor)
	{
		const sourceDrive = this.drives[parameters.sourceDrive];
		const targetDrive = this.drives[parameters.targetDrive];
		if (!sourceDrive || !targetDrive)
			return this.replyError(this.newError( { message: 'awi:drive-not-found', data: parameters.sourceDrive + ' ' + parameters.targetDrive }, { functionName: 'command_copyFileBetweenDrives' } ), message, editor);

		const downloadParams = {
			...parameters,
			fileId: parameters.sourceFileId
		};
		const downloadResult = await sourceDrive.command_downloadFile(downloadParams);
		if (downloadResult.isError())
			return this.replyError(downloadResult, message, editor);

		const uploadParams = {
			...parameters,
			filePath: downloadResult.data.filePath,
			fileName: parameters.targetFileName || downloadResult.data.name,
			parentId: parameters.targetParentId
		};
		const uploadResult = await targetDrive.command_uploadFile(uploadParams);
		if (uploadResult.isError())
			return this.replyError(uploadResult, message, editor);

		// Cleanup temp file
		this.awi.files.deleteFile(downloadResult.data.filePath);
		return this.replySuccess(this.newAnswer(uploadResult.data.file), message, editor);
	}

	async command_moveFileBetweenDrives(parameters, message, editor)
	{
		const copyResult = await this.command_copyFileBetweenDrives(parameters);
		if (copyResult.isError())
			return this.replyError(copyResult, message, editor);

		const sourceDrive = this.drives[parameters.sourceDrive];
		const deleteParams = {
			...parameters,
			fileId: parameters.sourceFileId
		};
		const deleteResult = await sourceDrive.command_deleteFile(deleteParams);
		if (deleteResult.isError())
			return this.replyError(deleteResult, message, editor);
		return this.replySuccess(this.newAnswer(copyResult.data.file), message, editor);
	}
}
