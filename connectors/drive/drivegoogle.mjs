/**
 *            / \
 *          / _ \              (°°)       Intelligent
 *        / ___ \ [ \ [ \ [     ]       Programmable
 *     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
 * (_)|____| |____|\_\_/\_\_/ [_| |_] \     link:
 *
 * This file is open-source under the conditions contained in the
 * license file located at the root of this project.
 * Please support the project: https://patreon.com/francoislionet
 *
 * ----------------------------------------------------------------------------
 * @file drivegoogle.mjs
 * @author FL (Francois Lionet)
 * @version 0.5
 *
 * @short Google Drive connector.
 *
 */
import ConnectorDriveBase from './drivebase.mjs'
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { ConnectorDriveGoogle as Connector }

class ConnectorDriveGoogle extends ConnectorDriveBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Google Drive';
		this.className = 'ConnectorDriveGoogle';
		this.token = 'drivegoogle';
		this.version = '0.5';

		// Google API specific properties
		this.drive = null;
		this.oauthClient = null;
		this.scopes = [
			'https://www.googleapis.com/auth/drive',
	];
	}

	async connect(options)
	{
		await super.connect(options);

		// Create OAuth client
		this.oauthClient = new google.auth.OAuth2();

		// Initialize the Drive API
		this.drive = google.drive({ version: 'v3', auth: this.oauthClient });

		return this.setConnected(true);
	}

	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);

		// Register all commands
		info[this.token].commands.listFiles = this.command_listFiles.bind(this);
		info[this.token].commands.getFile = this.command_getFile.bind(this);
		info[this.token].commands.downloadFile = this.command_downloadFile.bind(this);
		info[this.token].commands.uploadFile = this.command_uploadFile.bind(this);
		info[this.token].commands.createFolder = this.command_createFolder.bind(this);
		info[this.token].commands.deleteFile = this.command_deleteFile.bind(this);
		info[this.token].commands.renameFile = this.command_renameFile.bind(this);
		info[this.token].commands.moveFile = this.command_moveFile.bind(this);
		info[this.token].commands.searchFiles = this.command_searchFiles.bind(this);
		info[this.token].commands.watchFolder = this.command_watchFolder.bind(this);

		return this.newAnswer(info);
	}

	// Implementation of the abstract methods from the base class
	async _listFiles(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			let query = `'${parameters.folderId}' in parents and trashed=false`;			
			if (parameters.query)
				query += ` and ${parameters.query}`;
			const params = {
				q: query,
				pageSize: parameters.limit || 100,
				fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents)',
				orderBy: 'modifiedTime desc'
			};
			const response = await this.drive.files.list(params);
			const files = response.data.files.map(file => this._convertGoogleFileToStandard(file));
			return this.newAnswer(files);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-list-files-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _getFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const response = await this.drive.files.get(
			{
				fileId: parameters.fileId,
				fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents'
			});
			return this.newAnswer(this._convertGoogleFileToStandard(response.data));
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-get-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _downloadFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const fileMetadata = await this.drive.files.get(
			{
				fileId: parameters.fileId,
				fields: 'name, size, mimeType'
			});
			const filePath = await this.awi.files.getTempPath('drive', this.awi.system.getExtensionFromMimeType(fileMetadata.data.mimeType));
			if (filePath.isError())
				return this.newError( { message: 'awi:google-download-file-failed', data: filePath.error }, { stack: new Error().stack } );
			const destStream = fs.createWriteStream(filePath.data);
			const response = await this.drive.files.get(
			{
				fileId: parameters.fileId,
				alt: 'media'
			},
			{
				responseType: 'stream'
			});
			return new Promise((resolve, reject) => {
				response.data
					.on('end', () => {
						resolve(this.newAnswer({
							filePath: filePath.data,
							size: fileMetadata.data.size,
							name: fileMetadata.data.name,
							mimeType: fileMetadata.data.mimeType
						}));
					})
					.on('error', (err) => {
						return this.newError( { message: 'awi:google-download-file-failed', data: err }, { stack: new Error().stack } );
					})
					.pipe(destStream);
			});
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-download-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _uploadFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const fileMetadata = {
				name: parameters.fileName || 'Untitled',
				parents: parameters.parentId ? [parameters.parentId] : undefined
			};
			const media = {
				mimeType: parameters.mimeType || 'application/octet-stream',
				body: parameters.fileData ? parameters.fileData : fs.createReadStream(parameters.filePath)
			};
			const response = await this.drive.files.create(
			{
				resource: fileMetadata,
				media: media,
				fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink'
			});
			return this.newAnswer(this._convertGoogleFileToStandard(response.data));
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-upload-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _createFolder(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const fileMetadata = {
				name: parameters.name,
				mimeType: 'application/vnd.google-apps.folder',
				parents: parameters.parentId ? [parameters.parentId] : undefined
			};
			const response = await this.drive.files.create(
			{
				resource: fileMetadata,
				fields: 'id, name, mimeType, createdTime, modifiedTime, webViewLink'
			});
			return this.newAnswer(this._convertGoogleFileToStandard(response.data));
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-create-folder-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _deleteFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			await this.drive.files.delete(
			{
				fileId: parameters.fileId
			});
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-delete-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _renameFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			await this.drive.files.update(
			{
				fileId: parameters.fileId,
				resource: {
					name: parameters.newName
				}
			});
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-rename-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _moveFile(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const file = await this.drive.files.get(
			{
				fileId: parameters.fileId,
				fields: 'parents'
			});
			const previousParents = file.data.parents ? file.data.parents.join(',') : '';
			await this.drive.files.update(
			{
				fileId: parameters.fileId,
				addParents: parameters.newParentId,
				removeParents: previousParents,
				fields: 'id, parents'
			});
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-move-file-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _searchFiles(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			let query = 'trashed=false';
			if (parameters.query && typeof parameters.query === 'string' && parameters.query.trim().length)
				query += ` and (${parameters.query})`;
			else
			{
				if (parameters.name)
					query += ` and name contains '${parameters.name}'`;
				if (parameters.mimeType)
					query += ` and mimeType='${parameters.mimeType}'`;
			}
			const params = {
				q: query,
				pageSize: parameters.limit || 100,
				fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents)',
				orderBy: 'modifiedTime desc'
			};
			const response = await this.drive.files.list(params);
			const files = response.data.files.map(file => this._convertGoogleFileToStandard(file));
			return this.newAnswer(files);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-search-files-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async _watchFolder(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials({ access_token: googleToken.data });

			const response = await this.drive.files.watch(
			{
				fileId: parameters.folderId,
				requestBody: {
					id: this._generateId(),
					type: 'web_hook',
					address: parameters.webhookUrl || this.config.webhookUrl
				}
			});
			return this.newAnswer({
				watchId: response.data.id,
				resourceId: response.data.resourceId,
				expiration: response.data.expiration
			});
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-watch-folder-failed', data: error }, { stack: new Error().stack } );
		}
	}

	_convertGoogleFileToStandard(file)
	{
		return this._createStandardFile(
		{
			id: file.id,
			name: file.name,
			mimeType: file.mimeType,
			size: parseInt(file.size) || 0,
			createdTime: file.createdTime,
			modifiedTime: file.modifiedTime,
			isFolder: file.mimeType === 'application/vnd.google-apps.folder',
			parentId: file.parents && file.parents.length > 0 ? file.parents[0] : null,
			webViewLink: file.webViewLink,
			webContentLink: file.webContentLink,
			thumbnailLink: file.thumbnailLink,
			source: this.token
		});
	}

	async findMeetRecordingsFolder(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials({ access_token: googleToken.data });

			const response = await this.drive.files.list(
			{
				q: "name='Meet Recordings' and mimeType='application/vnd.google-apps.folder' and trashed=false",
				fields: 'files(id, name)',
				pageSize: 1
			});
			if (response.data?.files && response.data.files.length > 0)
				return this.newAnswer(response.data.files[0].id);
			return this.newError( { message: 'awi:google-meet-recordings-folder-not-found' } );
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-find-meet-recordings-folder-failed', data: error }, { stack: new Error().stack } );
		}
	}

	async pollMeetRecordings(parameters)
	{
		try
		{
			var googleToken = await this.awi.authentification.getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials({ access_token: googleToken.data });

			var folderId = await this.findMeetRecordingsFolder(parameters);			
			if (folderId.isError())
				return this.newAnswer([]);
			folderId = folderId.data;

			const afterTime = parameters.afterTime || new Date(Date.now() - 3600000).toISOString(); 
			const query = `'${folderId}' in parents and mimeType='video/mp4' and createdTime > '${afterTime}' and trashed=false`;
			const response = await this.drive.files.list(
			{
				q: query,
				fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
				orderBy: 'createdTime desc',
				pageSize: 10
			});
			const files = response.data.files.map(file => this._convertGoogleFileToStandard(file));
			return this.newAnswer(files);
		}
		catch (error)
		{
			return this.newError( { message: 'awi:google-poll-meet-recordings-failed', data: error }, { stack: new Error().stack } );
		}
	}
}
