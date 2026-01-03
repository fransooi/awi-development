/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [     ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\__/\__/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file storage.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Supabase storage connector.
*
*/
import ConnectorDatabaseBase from './databasebase.mjs'
import { createClient } from '@supabase/supabase-js';
export { ConnectorStorage as Connector }
class ConnectorStorage extends ConnectorDatabaseBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'ConnectorStorage';
		this.token = 'storage';
		this.version = '0.5';
		this.supabase = null;
		this.url = config.url || '';
		this.secretKey = config.secretKey || '';
		this.fileMode = config.fileMode || 'files';  // 'files' or 'supabase'
		this.storagePath = config.storagePath || 'storage';
		this.publicUrlPath = config.publicUrlPath || '';
		this.publicUrl = config.publicUrl || '';
		this.downloadTokens = new Map(); // For signed URL tokens (fileMode: 'files')
	}
	async connect( options )
	{
		await super.connect( options );

		this.fileMode = options.fileMode || this.fileMode;
		this.storagePath = options.storagePath || this.storagePath;
		this.publicUrlPath = options.publicUrlPath || this.publicUrlPath;
		this.publicUrl = options.publicUrl || this.publicUrl;
		if (this.fileMode == 'supabase')
		{
			this.url = options.url || this.url;
			this.secretKey = options.secretKey || this.secretKey;
			if ( !this.url || !this.secretKey )
				return this.setConnected( false );
			try
			{
				this.supabase = createClient( this.url, this.secretKey );
			}
			catch ( error )
			{
				console.log(error);
				return this.setConnected( false );
			}
		}
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.command_signOut = this.command_signOut.bind(this);
		info[ this.token ].commands.command_uploadFile = this.command_uploadFile.bind(this);
		info[ this.token ].commands.command_downloadFile = this.command_downloadFile.bind(this);
		info[ this.token ].commands.command_getPublicUrl = this.command_getPublicUrl.bind(this);
		info[ this.token ].commands.command_closePublicUrl = this.command_closePublicUrl.bind(this);
		info[ this.token ].commands.command_deleteFile = this.command_deleteFile.bind(this);
		info[ this.token ].commands.command_getSignedUrl = this.command_getSignedUrl.bind(this);
		return this.newAnswer( info );
	}
	async validateToken( token )
	{
		if (!token || !this.supabase)
			return false;
		const { data: { user }, error } = await this.supabase.auth.getUser(token);
		if (error || !user)
			return false;
		return { user: user };
	}

	async command_signOut( parameters, message, editor )
	{
		const st = parameters?.supabaseTokens || {};
		const bearer = st.client_token || st.access_token || null;
		if (!await this.validateToken(bearer))
			return this.replyError( this.newError( { message: 'supabase:invalid-token', data: bearer }, { stack: new Error().stack } ), message, editor );

		switch (this.fileMode)
		{
			case 'supabase':
				const { error } = await this.supabase.auth.signOut();
				if (error)
					return this.replyError( this.newError( { message: 'supabase:signout-error', data: error }, { stack: new Error().stack } ), message, editor );
				break;
			case 'files':
				break;
		}
		return this.replySuccess( this.newAnswer( {} ), message, editor );
	}

	/**
	 * Get an authenticated Supabase client using the user's token
	 */
	_getAuthenticatedClient(supabaseTokens)
	{
		if (supabaseTokens)
		{
			const bearer = supabaseTokens.client_token || supabaseTokens.access_token || null;
			if (bearer)
				return createClient(this.url, this.secretKey, { global: { headers: { Authorization: `Bearer ${bearer}` } } });
		}
		return this.supabase;
	}

	async command_uploadFile(parameters, message, editor)
	{
		try
		{
			switch (this.fileMode)
			{
				case 'supabase':
					// Build path: supabaseUserId/path (e.g., "uuid/recordingHandle/audio.mp3")
					// Using auth.uid() for RLS compatibility
					const supabasePath = parameters.supabaseUserId + '/' + parameters.path;
					
					// Get file content - either from path string or Buffer
					let fileContent;
					if (typeof parameters.file === 'string')
					{
						// It's a file path, read the file
						const readResult = await this.awi.system.readFile(parameters.file);
						if (readResult.isError())
							return this.replyError(this.newError({ message: 'supabase:read-file-error', data: readResult.message }, { stack: new Error().stack }), message, editor);
						fileContent = readResult.data;
					}
					else
					{
						// It's already a Buffer
						fileContent = parameters.file;
					}
					
					// Use authenticated client with user's token
					const client = this._getAuthenticatedClient(parameters.supabaseTokens);
					const { data, error } = await client.storage
						.from(parameters.bucket)
						.upload(supabasePath, fileContent, parameters.options);
					if (error) 
						return this.replyError(this.newError({ message: 'supabase:upload-error', data: error }, { stack: new Error().stack }), message, editor);
					
					// Return the path as identifier (without userName prefix for consistency)
					return this.replySuccess(this.newAnswer({ identifier: parameters.path }), message, editor);

				case 'files':
					const userName = parameters.userNameMapped || parameters.userName;
					var userPath = this.awi.files.convertToFileName(userName);
					const extension = this.awi.system.extname(parameters.path).substring(1);
					const checkPath = this.awi.system.join(this.storagePath, userPath, parameters.bucket);
					var answer = this.awi.files.createDirectories(checkPath);
					if (!answer.isSuccess()) 
						return this.replyError( this.newError( { message: 'files:create-directories-error', data: answer }, { stack: new Error().stack } ), message, editor );
					answer = await this.awi.files.getTempFilename(checkPath, 'storage', extension);
					if (!answer.isSuccess()) 
						return this.replyError( this.newError( { message: 'files:get-temp-filename-error', data: answer }, { stack: new Error().stack } ), message, editor );
					const newFileName = answer.data;
					const fullPath = this.awi.system.join(this.storagePath, userPath, parameters.bucket, newFileName);
					if ( typeof parameters.file == 'string' )
						answer = await this.awi.system.copyFile(parameters.file, fullPath);
					else
						answer = await this.awi.system.writeFile(fullPath, parameters.file);
					if (answer.isError()) 
						return this.replyError(answer, message, editor);
					return this.replySuccess( this.newAnswer({ identifier: newFileName }), message, editor );
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:upload-error', data: error.message }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_downloadFile(parameters, message, editor) 
	{
		try
		{
			switch (this.fileMode)
			{
				case 'supabase':
					// Build path: supabaseUserId/identifier (using auth.uid() for RLS)
					const supabasePath = parameters.supabaseUserId + '/' + parameters.identifier;
					const client = this._getAuthenticatedClient(parameters.supabaseTokens);
					const { data, error } = await client.storage
						.from(parameters.bucket)
						.download(supabasePath);
					if (error) 
						return this.replyError(this.newError({ message: 'supabase:download-error', data: error }, { stack: new Error().stack }), message, editor);
					const arrayBuffer = await data.arrayBuffer();
					return this.replySuccess(this.newAnswer(Buffer.from(arrayBuffer)), message, editor);

				case 'files':
					const userName = parameters.userNameMapped || parameters.userName;
					var userPath = this.awi.files.convertToFileName(userName);
					const fullPath = this.awi.system.join(this.storagePath, userPath, parameters.bucket, parameters.identifier);
					const answer = await this.awi.system.readFile(fullPath);
					if (!answer.isSuccess()) 
						return this.replyError(answer, message, editor);
					return this.replySuccess(answer, message, editor);
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:download-error', data: error.message }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_getPublicUrl(parameters, message, editor) 
	{
		try
		{
			switch (this.fileMode)
			{
				case 'supabase':
					// Build path: supabaseUserId/identifier (using auth.uid() for RLS)
					const supabasePath = parameters.supabaseUserId + '/' + parameters.identifier;
					const client = this._getAuthenticatedClient(parameters.supabaseTokens);
					const { data } = client.storage
						.from(parameters.bucket)
						.getPublicUrl(supabasePath);
					return this.replySuccess(this.newAnswer(data), message, editor);

				case 'files':
					var userPath = this.awi.files.convertToFileName(parameters.userId);
					const sourcePath = this.awi.system.join(this.storagePath, userPath, parameters.bucket, parameters.identifier);
					const destinationPath = this.awi.system.join(this.publicUrlPath, userPath, parameters.bucket);
					var answer = await this.awi.files.createDirectories(destinationPath);
					if (answer.isError()) return this.replyError(answer, message, editor);
					answer = await this.awi.system.copyFile(sourcePath, destinationPath + '/' + parameters.identifier);
					if (answer.isError()) return this.replyError(answer, message, editor);
					return this.replySuccess(
						this.newAnswer(
						{
							publicUrl: this.publicUrl + '/' + userPath + '/' + parameters.bucket + '/' + parameters.identifier }
						), message, editor );
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:get-public-url-error', data: error.message }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_closePublicUrl(parameters, message, editor) 
	{
		try
		{
			switch (this.fileMode)
			{
				case 'supabase':
					return this.replySuccess( this.newAnswer(true), message, editor );

				case 'files':
					const publicUrlPath = this.awi.system.join(this.publicUrlPath, parameters.bucket, parameters.identifier);
					if ( this.awi.system.exists(publicUrlPath).isSuccess() )
						await this.awi.files.unlink(publicUrlPath);
					return this.replySuccess( this.newAnswer(true), message, editor );
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:close-public-url-error', data: error.message }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_deleteFile(parameters, message, editor) 
	{
		try
		{
			switch (this.fileMode)
			{
				case 'supabase':
					// Build path: supabaseUserId/identifier (using auth.uid() for RLS)
					const supabasePath = parameters.supabaseUserId + '/' + parameters.identifier;
					const client = this._getAuthenticatedClient(parameters.supabaseTokens);
					const { error } = await client.storage
						.from(parameters.bucket)
						.remove([supabasePath]);
					if (error) 
						return this.replyError(this.newError({ message: 'supabase:delete-error', data: error }, { stack: new Error().stack }), message, editor);
					return this.replySuccess(this.newAnswer(true), message, editor);

			case 'files':
				var userPath = this.awi.files.convertToFileName(parameters.userId);
				const fullPath = this.awi.system.join(this.storagePath, userPath, parameters.bucket, parameters.identifier);
				await this.awi.system.unlink(fullPath);
				const tempPath = this.awi.system.join(this.publicUrlPath, userPath, parameters.bucket, parameters.identifier);
				if ( this.awi.system.exists(tempPath).isSuccess() )
					await this.awi.system.unlink(tempPath);
				return this.replySuccess( this.newAnswer(true), message, editor );
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:delete-error', data: error.message }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_getSignedUrl(parameters, message, editor) 
	{
		try
		{
			const expiresIn = parameters.expiresIn || 300; // 5 minutes default
			
			switch (this.fileMode)
			{
				case 'supabase':
					// Build path: supabaseUserId/identifier (using auth.uid() for RLS)
					const filePath = parameters.supabaseUserId + '/' + parameters.identifier;
					const client = this._getAuthenticatedClient(parameters.supabaseTokens);
					const { data, error } = await client.storage
						.from(parameters.bucket)
						.createSignedUrl(filePath, expiresIn);
					if (error) 
						return this.replyError(this.newError({ message: 'supabase:signed-url-error', data: error }, { stack: new Error().stack }), message, editor);
					return this.replySuccess(this.newAnswer({ 
						signedUrl: data.signedUrl, 
						expiresIn: expiresIn 
					}, { stack: new Error().stack }), message, editor);

				case 'files':
					// Generate a unique token for this download
					const token = this.awi.utilities.getUniqueIdentifier({}, 'download');
					const expiry = Date.now() + (expiresIn * 1000);
					const userName = parameters.userNameMapped || parameters.userName;
					var userPath = this.awi.files.convertToFileName(userName);
					const fullPath = this.awi.system.join(this.storagePath, userPath, parameters.bucket, parameters.identifier);
					
					// Verify file exists
					const exists = await this.awi.system.exists(fullPath);
					if (!exists.isSuccess())
						return this.replyError(this.newError({ message: 'storage:file-not-found', data: fullPath }, { stack: new Error().stack }), message, editor);
					
					// Store token with file info
					this.downloadTokens.set(token, {
						path: fullPath,
						userName: parameters.userName,
						identifier: parameters.identifier,
						bucket: parameters.bucket,
						expiry: expiry,
						mimeType: parameters.mimeType || 'audio/mpeg'
					});
					
					// Cleanup expired tokens periodically
					this._cleanupExpiredTokens();
					
					const signedUrl = `${this.publicUrl}/download/${token}`;
					return this.replySuccess(this.newAnswer({ 
						signedUrl: signedUrl, 
						expiresIn: expiresIn 
					}, { stack: new Error().stack  }), message, editor);
			}
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'storage:signed-url-error', data: error }, { stack: new Error().stack }), message, editor);
		}
	}

	/**
	 * Validate a download token and return file info if valid
	 * @param {string} token - The download token to validate
	 * @returns {object|null} - Token data if valid, null if invalid/expired
	 */
	validateDownloadToken(token)
	{
		if (!this.downloadTokens.has(token))
			return null;
		
		const tokenData = this.downloadTokens.get(token);
		if (Date.now() > tokenData.expiry)
		{
			this.downloadTokens.delete(token);
			return null;
		}
		
		return tokenData;
	}

	/**
	 * Consume a download token (one-time use)
	 * @param {string} token - The token to consume
	 */
	consumeDownloadToken(token)
	{
		this.downloadTokens.delete(token);
	}

	/**
	 * Cleanup expired tokens to prevent memory leaks
	 */
	_cleanupExpiredTokens()
	{
		const now = Date.now();
		for (const [token, data] of this.downloadTokens.entries())
		{
			if (now > data.expiry)
				this.downloadTokens.delete(token);
		}
	}
}
