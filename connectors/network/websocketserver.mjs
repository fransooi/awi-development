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
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file websocket.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Connector opening a WebSocket server on the machine
*        to receive / send prompts.
*/
import ConnectorBase from '../../connector.mjs'
import { SERVERCOMMANDS } from '../../servercommands.mjs'
import { WebSocketServer } from 'ws'
import Awi from '../../awi.mjs'
import crypto from 'crypto'
export { ConnectorWebSocketServer as Connector }

class ConnectorWebSocketServer extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'WebSocket Server';
		this.token = 'websocket';
		this.className = 'ConnectorWebSocketServer';
		this.group = 'network';
		this.version = '0.5';
		this.editors = {};
		this.wsServer = null;
		// Map of ongoing chunked transfers: key `${handle}:${transferId}` -> state
		this._chunkTransfers = {};
	}
	async connect( options )
	{
		super.connect( options );
		this.port = options.port || 1033;
		this.templatesPath = options.templatesPath || this.awi.system.getEnginePath() + '/connectors/projects';
		if ( !this.wsServer )
		{
			var self = this;
			var socketOptions = { port: this.port };
			var server = this.awi.http.getHttpsServer();
			if (server)
				socketOptions = { server };
			this.wsServer = new WebSocketServer( socketOptions );
			this.wsServer.on( 'connection', function( ws )
			{
				var connection = ws;
				connection.on( 'message',
					function( json, isBinary )
					{
						var message = '';
						// Convert buffer to string
						if ( Buffer.isBuffer( json ) )
						{
							message = json.toString();
							message = JSON.parse( message );
						}
						else
						{
							message = json;
						}

						// Transparent chunked transfer handling
						try
						{
							if (message && message.parameters && message.parameters.__chunkMeta)
							{
								const meta = message.parameters.__chunkMeta || {};
								const key = `${message.handle || ''}:${meta.transferId || ''}`;
								const now = Date.now();

								// Helper to send ACKs back to client
								const sendAck = (extra = {}) =>
								{
									try
									{
										connection.send(JSON.stringify({
											id: message.id,
											callbackId: message.id,
											handle: message.handle,
											responseTo: message.command,
											parameters: { ok: true, transferId: meta.transferId, ...extra }
										}));
									}
									catch(e)
									{
									}
								};

								switch (meta.mode)
								{
									case 'start':
									{
										// Initialize state for this transfer
										const state = {
											startedAt: now,
											lastActivity: now,
											handle: message.handle,
											fieldPath: meta.fieldPath || 'data',
											totalSize: meta.totalSize || 0,
											expectedBase64Length: meta.base64Length || 0,
											expectedSha256: meta.checksumSha256 || '',
											receivedBytes: 0,
											parts: [],
											baseParams: (() =>
											{
												const p = { ...message.parameters };
												delete p.__chunkMeta;
												return p;
											})()
										};
										self._chunkTransfers[key] = state;
										sendAck({ started: true });
										return;
									}
									case 'chunk':
									{
										const state = self._chunkTransfers[key];
										if (!state)
										{
											sendAck({ ok: false, error: 'chunk:unknown-transfer' });
											return;
										}
										state.lastActivity = now;
										try
										{
											const b64 = meta.base64 || '';
											state.parts.push(b64);
											// Update received bytes estimate
											const len = b64.length;
											const pad = (b64.endsWith('==') ? 2 : (b64.endsWith('=') ? 1 : 0));
											const bytes = Math.floor((len / 4) * 3) - pad;
											state.receivedBytes += Math.max(0, bytes);
											sendAck({ chunkIndex: meta.chunkIndex, received: state.receivedBytes });
										}
										catch(e)
										{
											sendAck({ ok: false, error: 'chunk:error' });
										}
										return;
									}
									case 'end':
									{
										const state = self._chunkTransfers[key];
										if (!state)
										{
											sendAck({ ok: false, error: 'end:unknown-transfer' });
											return;
										}
										delete self._chunkTransfers[key];
										// Rebuild final parameters with the large field
										const fullBase64 = state.parts.join('');
										// Integrity checks (length and checksum if provided)
										if (state.expectedBase64Length && fullBase64.length !== state.expectedBase64Length)
										{
											try
											{
												connection.send(JSON.stringify({
													id: message.id,
													callbackId: message.id,
													handle: message.handle,
													responseTo: message.command,
													parameters: { ok: false, error: 'end:length-mismatch', expected: state.expectedBase64Length, got: fullBase64.length }
												}));
											}
											catch(e)
											{
											}
											return;
										}
										if (state.expectedSha256)
										{
											try
											{
												const digest = crypto.createHash('sha256').update(fullBase64, 'utf8').digest('hex');
												if (digest !== state.expectedSha256)
												{
													connection.send(JSON.stringify({
														id: message.id,
														callbackId: message.id,
														handle: message.handle,
														responseTo: message.command,
														parameters: { ok: false, error: 'end:checksum-mismatch' }
													}));
													return;
												}
											}
											catch(e)
											{
												// If hashing fails, proceed without blocking
											}
										}
										const finalParams = { ...state.baseParams };
										// Set value at fieldPath
										const setByPath = (obj, path, value) =>
										{
											const parts = (path || 'data').split('.');
											let o = obj;
											for (let i = 0; i < parts.length - 1; i++)
											{
												const k = parts[i];
												if (!o[k] || typeof o[k] !== 'object')
												{
													o[k] = {};
												}
												o = o[k];
											}
											o[parts[parts.length - 1]] = fullBase64;
										};
										setByPath(finalParams, state.fieldPath, fullBase64);

										// Forward a normal message upstream (transparent)
										const fwd = { ...message, parameters: finalParams };
										delete fwd.parameters.__chunkMeta;
										var editor = self.editors[ fwd.handle ];
										if ( editor )
											editor.onMessage( fwd );
										return;
									}
									default:
									{
										// Unknown mode, drop
										sendAck({ ok: false, error: 'unknown-mode' });
										return;
									}
								}
							}
						}
						catch(e)
						{
							// Fall through to normal handling on errors
						}
						if ( message.command == SERVERCOMMANDS.CONNECT )
						{
							self.user_connect( connection, message );
						}
						else
						{
							var editor = self.editors[ message.handle ];
							if ( editor )
								editor.onMessage( message );
						}
					} );
				connection.on( 'close',
					function( reasonCode, description )
					{
						self.user_disconnected( connection );
					} );

			} );
		}
		this.connectMessage = '\n.... ' + this.awi.messages.getMessage( 'awi:websocket-server-start', { name: 'WebSocket Server', port: this.port } );
		return this.setConnected( true );
	}
	user_disconnected( connection )
	{
		for ( var e in this.editors )
		{
			var editor = this.editors[ e ];
			if ( editor.connection == connection )
			{
				break;
			}
		}
		if ( editor )
		{
			var userName = editor.userName;
			this.awi.editor.print('awi:socket-user-disconnected', { name: userName, user: 'awi' } );

			editor.close();
			var newEditors = {};
			for ( var e in this.editors )
			{
				if ( e != editor.handle )
				{
					newEditors[ e ] = this.editors[ e ];
				}
			}
			this.editors = newEditors;
		}

	}
	async user_connect( connection, message )
	{
		// Authenticate user
		var answer = await this.awi.authentification.loginAccount(
		{
			token: message.parameters.token,
			userName: message.parameters.userName,
			password: message.parameters.password
		} );
		if ( answer.isError() )
		{
			if ( message.parameters.createAccount )
			{
				answer = await this.awi.authentification.createAccount(
				{
					token: message.parameters.token,
					userName: message.parameters.userName,
					password: message.parameters.password
				} );
				if ( answer.isSuccess() )
				{
					answer = await this.awi.authentification.loginAccount(
					{
						token: message.parameters.token,
						userName: message.parameters.userName,
						password: message.parameters.password
					} );
				}
			}
			if ( answer.isError() )
			{
				connection.send(JSON.stringify({
					id: message.id,
					callbackId: message.id,
					handle: message.handle,
					responseTo: message.command,
					parameters: { error: answer.error }
				}));
				return;
			}
		}
		var restKey = answer.data.key;

		// Create session of AWI
		if ( message.parameters.debug )
		{
			this.templatesUrl = '/templates';
			this.projectsUrl = '/projects';
			this.runUrl = 'http://localhost:3333/projects';
		}
		else
		{
			this.templatesUrl = 'https://localhost:8080/templates';
			this.projectsUrl = 'https://localhost:8080/projects';
			this.runUrl = 'https://localhost:8080/projects';
		}
		var sourceConfig = message.parameters.config;
		var config = {
			prompt: '',
			elements: []
		}
		if ( typeof sourceConfig.prompt == 'string' )
			config.prompt = sourceConfig.prompt;
		for ( var e = 0; e < sourceConfig.elements.length; e++ )
		{
			var sConfig = sourceConfig.elements[ e ];
			switch ( sConfig.name )
			{
				case 'connectors/awi/configuration':
					sConfig.config.configurationPath = this.awi.configuration.getConfigurationPath();
					sConfig.config.dataPath = this.awi.configuration.getDataPath();
					config.elements.push( sConfig );
					break;
				case 'connectors/editor/editor':
					break;
				default:
					config.elements.push( sConfig );
					break;
			}
		}
		config.elements.push( {
			name: 'connectors/editor/editor',
			config: { priority: 99 },
			options: { editors:
				{
					websocket:{
						lastMessage: message,
						connection: connection,
						parent: this,
						connect: false,
						templatesUrl: this.templatesUrl,
						runUrl: this.runUrl,
						projectsUrl: this.projectsUrl,
					}
				}  } } );

		// Create new session of AWI
		var awi2 = new Awi( this.awi, config );
		var answer = await awi2.connect( {} );
		if ( answer.isSuccess() )
		{
			this.awi.editor.print('awi:socket-new-connection', { name: message.parameters.userName, user: 'awi' } );
			for ( var e in awi2.editor.editors )
			{
				var current = awi2.editor.editors[e];
				this.editors[ current.handle ] = current;
				await current.connect( message.parameters, message );
			}
			return current.replySuccess(this.newAnswer({ handle: current.handle, restKey: restKey }), message);
		}
		connection.send(JSON.stringify({
			id: message.id,
			callbackId: message.callbackId,
			handle: message.handle,
			responseTo: message.command,
			parameters: { error: 'awi:socket-error-processing-command' }
		}));
	}
}
