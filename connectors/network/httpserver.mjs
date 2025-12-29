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
* @file httpserver.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Connector opening a HTTP server on the machine
*        to receive / send data and serve the interface.
*/
import ConnectorBase from '../../connector.mjs'
import { SERVERCOMMANDS } from '../../servercommands.mjs'
import express from 'express'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import chokidar from 'chokidar'
import multer from 'multer'
import crypto from 'crypto'
import session from 'express-session'

export { ConnectorHttpServer as Connector }

class ConnectorHttpServer extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'HTTP Server';
		this.token = 'http';
		this.className = 'ConnectorHttpServer';
		this.group = 'network';
		this.version = '0.5';
		this.editors = {};

		// Express app and server instances
		this.app = null;
		this.httpServer = null;
		this.httpsServer = null;
		this.watcher = null;
		this.domain = 'http://localhost:3000';
		this.webhooks = {};
		this.routerBase = '/awi';
		this._connectorRouteMap = {};
		this.tempPath = this.awi.configuration.getTempPath();
		this.keyToUserName = {};
		this.chunkSessions = new Map(); // uploadId -> ChunkSession
	}
	getServerConfig()
	{
		return this.serverConfig;
	}
	async connect( options )
	{
		super.connect( options );
		this.domain = options.domain || this.domain;
		this.rootDirectory = options.rootDirectory || './public';
		this.envFilePath = options.envFilePath || null;

		// Default configuration
		this.serverConfig = {
			enableHttp: options.enableHttp || false,
			port: options.port || 3000,
			httpsPort: options.httpsPort || 3443,
			rootDirectory: this.rootDirectory,
			enableHttps: options.enableHttps || false,
			httpsOptions: options.httpsOptions || {
				key: './certs/key.pem',
				cert: './certs/cert.pem'
			},
			cors: options.cors !== undefined ? options.cors : true,
			watchFiles: options.watchFiles !== undefined ? options.watchFiles : true,
			databasePrefix: options.databasePrefix || '',
			projectName: options.projectName || 'AWI Server',
			watchOptions: options.watchOptions || {
				ignored: /(^|[\/\\])\./, // ignore dotfiles
				ignoreInitial: true
			}
		};

		var countComplete = 0;
		var toComplete = (this.serverConfig.enableHttp ? 1 : 0) + (this.serverConfig.enableHttps ? 1 : 0);
		this.connectMessage = '\n';
		try
		{
			// Create Express app
			this.app = express();

			// Trust proxy to get real client IP from X-Forwarded-For header (NGINX proxy)
			this.app.set('trust proxy', true);

			// Middleware
			this.app.use(cors());
			this.app.use(helmet({ contentSecurityPolicy: false })); // Allow inline scripts/styles for wizard
			this.app.use(express.json({ limit: '50mb' }));
			this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

			// Status Endpoint
			this.app.get('/awi/status', async (req, res) => {
				const db = this.awi.database;
				const connected = db ? db.connected : false;
				// If it's the Supabase connector, check if the client is actually initialized
				const valid = (db && db.className === 'ConnectorSupabase') ? (connected && !!db.supabase) : connected;
				
				let profileNeeded = false;
				let manualSetup = false;
				let sql = '';

				if (valid) {
					// Check for manual setup requirement (bootstrap failed)
					if (db.className === 'ConnectorSupabase' && db.bootstrapFailed) {
						manualSetup = true;
						if (typeof db.getBootstrapSQL === 'function') {
							sql = db.getBootstrapSQL();
						}
					} else {
						// Check if any user exists
						const users = this.awi.configuration.getUserList();
						profileNeeded = (users.length === 0);
					}
				}

				res.json({
					system: 'online',
					database: valid ? 'connected' : 'disconnected',
					setupNeeded: !valid,
					manualSetup: manualSetup,
					sql: sql,
					profileNeeded: profileNeeded
				});
			});

			// Profile Creation Endpoint
			this.app.post('/awi/profile', async (req, res) => {
				const { firstName, lastName, userName } = req.body;
				if (!firstName || !lastName || !userName)
					return res.status(400).json({ success: false, message: 'Missing fields' });

				try {
					// Check if username already exists
					const existing = this.awi.configuration.getConfig(userName.toLowerCase());
					if (existing) {
						const suggestion = userName.toLowerCase() + Math.floor(Math.random() * 1000);
						return res.status(400).json({ 
							success: false, 
							message: 'Username already taken',
							suggestion: suggestion
						});
					}

					var config = this.awi.configuration.getNewUserConfig();
					config.firstName = firstName;
					config.lastName = lastName;
					config.fullName = firstName + ' ' + lastName;
					config.userName = userName;
					config.userId = crypto.randomUUID(); // Generate UUID for DB compatibility
					
					await this.awi.configuration.setNewUserConfig( config.userName.toLowerCase(), config );
					var answer = await this.awi.configuration.saveConfigs();
					
					if (answer.isSuccess()) {
						return res.json({ success: true });
					} else {
						return res.status(500).json({ success: false, message: answer.message });
					}
				} catch (e) {
					return res.status(500).json({ success: false, message: e.message });
				}
			});

			// Setup Endpoint
			this.app.post('/awi/setup', async (req, res) => {
				try {
					const { supabaseUrl, supabaseKey, serviceRoleKey } = req.body;
					if (!supabaseUrl || !supabaseKey)
						return res.status(400).json({ success: false, message: 'Missing credentials' });

					// 1. Update .env file
					if (this.envFilePath) {
						try {
							let content = '';
							if (fs.existsSync(this.envFilePath))
								content = fs.readFileSync(this.envFilePath, 'utf8');
							
							// Helper to replace or append
							const setEnv = (key, val) => {
								const regex = new RegExp(`^${key}=.*$`, 'm');
								if (regex.test(content))
									content = content.replace(regex, `${key}="${val}"`);
								else
									content += `\n${key}="${val}"`;
							};

							const prefix = this.serverConfig.databasePrefix || '';
							setEnv(prefix + 'SUPABASE_URL', supabaseUrl);
							setEnv(prefix + 'SUPABASE_SECRET_KEY', supabaseKey);
							if (serviceRoleKey) setEnv(prefix + 'SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

							fs.writeFileSync(this.envFilePath, content, 'utf8');
						} catch (e) {
							this.awi.log('Failed to write .env file', { level: 'error', error: e });
						}
					}

					// 2. Hot Update or Install Supabase Connector
					let connector = this.awi.database;
					
					if (!connector && this.awi.delayedConnectors && this.awi.delayedConnectors['supabase']) {
						// Install delayed connector
						const delayed = this.awi.delayedConnectors['supabase'];
						// Inject credentials into options
						delayed.options.url = supabaseUrl;
						delayed.options.secretKey = supabaseKey;
						if (serviceRoleKey) delayed.options.serviceRoleKey = serviceRoleKey;
						
						this.awi.log('Installing delayed Supabase connector...', { source: 'http', level: 'info' });
						const ans = await this.awi.installConnector(delayed);
						if (ans.isSuccess()) {
							connector = this.awi.database;
							delete this.awi.delayedConnectors['supabase'];
						} else {
							return res.status(500).json({ success: false, message: 'Failed to install database connector: ' + (ans.message || 'Unknown error') });
						}
					} else if (connector) {
						// Hot reconnect existing
						await connector.connect({
							url: supabaseUrl,
							secretKey: supabaseKey,
							serviceRoleKey: serviceRoleKey
						});
					} else {
						return res.status(500).json({ success: false, message: 'Database connector not loaded and no delayed configuration found.' });
					}

					// 3. Verify Connection
					if (connector && connector.connected) {
						// Check if bootstrap failed (manual setup required)
						if (connector.bootstrapFailed && typeof connector.getBootstrapSQL === 'function') {
							return res.json({ 
								success: false, 
								manualSetup: true, 
								message: 'Manual SQL execution required',
								sql: connector.getBootstrapSQL()
							});
						}

						// Refresh configurations now that DB is connected
						// This ensures we know if users exist for the profile step
						if (this.awi.configuration) {
							await this.awi.configuration.loadConfigs();
						}

						res.json({ success: true, message: 'Configuration saved.' });
						// Allow response to flush before exiting
						// setTimeout(() => process.exit(0), 500);
						return;
					} else {
						return res.status(500).json({ success: false, message: 'Saved but failed to connect.' });
					}
				} catch (e) {
					this.awi.log('Setup endpoint error', { level: 'error', error: e });
					return res.status(500).json({ success: false, message: 'Internal Server Error: ' + e.message });
				}
			});


			const normalizeIp = (ip) => {
				if (!ip) return '';
				let v = typeof ip === 'string' ? ip : String(ip);
				// Remove IPv6 brackets
				if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
				// Remove IPv6 zone ID (e.g., %eth0)
				const zi = v.indexOf('%');
				if (zi !== -1) v = v.slice(0, zi);
				// Unwrap IPv4-mapped IPv6 ::ffff:192.0.2.1
				if (v.startsWith('::ffff:')) v = v.slice(7);
				return v;
			};
			const safeErr = (e) =>
			{
				try { return { errorMessage: (e && e.message) ? ('' + e.message) : (e ? ('' + e) : ''), errorCode: e && e.code ? ('' + e.code) : undefined }; } catch { return { errorMessage: '' }; }
			};
			const ALLOWLIST_IPS = new Set(['82.67.173.228']);
			const REJECTED_IPS = new Set(['0.0.0.0']);
			this.app.use((req, res, next) => {
				// Prefer X-Forwarded-For (left-most) when behind proxy
				const xff = req.headers['x-forwarded-for'];
				const firstXff = (typeof xff === 'string' && xff.split(',')[0].trim()) || '';
				const raw = firstXff || req.headers['cf-connecting-ip'] || req.ip || (req.socket && req.socket.remoteAddress) || '';
				const ip = normalizeIp(raw);
				// Minimal behavior for now: do not block by allowlist; just attach normalized IP
				req.clientIp = ip;
				return next();
			});

			// Helper to sanitize logged objects (remove tokens/secrets)
			const sanitizeLog = (obj) =>
			{
				try
				{
					if (!obj || typeof obj !== 'object') return obj;
					const out = Array.isArray(obj) ? [] : {};
					for (const k of Object.keys(obj))
					{
						const v = obj[k];
						if (k === 'supabaseTokens') continue;
						if (/token|authorization|secret|password/i.test(k)) continue;
						if (v && typeof v === 'object') out[k] = '[Object]'; else out[k] = v;
					}
					return out;
				}
				catch { return {}; }
			};

			// Add request/response logging middleware
			this.app.use((req, res, next) =>
			{
				const startTime = Date.now();
				const requestId = Math.random().toString(36).substring(2, 10);

				// Log request
				const xff = req.headers['x-forwarded-for'];
				const firstXff = (typeof xff === 'string' && xff.split(',')[0].trim()) || '';
				const rawIp = firstXff || req.headers['cf-connecting-ip'] || req.ip || (req.socket && req.socket.remoteAddress) || '';
				const clientIp = normalizeIp(rawIp);
				this.awi.log('REQUEST', { source: 'http', level: 'info', requestId, method: req.method, url: req.url, ip: clientIp, userName: req.userName });
				if (Object.keys(req.query).length > 0) {
				  this.awi.log('QUERY params', { source: 'http', level: 'info', requestId, method: req.method, url: req.url, userName: req.userName, query: sanitizeLog(req.query) });
				}

				// Log once the response has finished
				res.on('finish', () =>
				{
					const responseTime = Date.now() - startTime;
					const len = res.getHeader('content-length');
					let contentLength = undefined;
					if (typeof len === 'string') { const n = parseInt(len, 10); if (!isNaN(n)) contentLength = n; }
					else if (typeof len === 'number') { contentLength = len; }
					else if (Array.isArray(len) && len.length > 0) { const n = parseInt(len[0], 10); if (!isNaN(n)) contentLength = n; }
					const level = (res.statusCode >= 500) ? 'error' : (res.statusCode >= 400 ? 'warning' : 'info');
					this.awi.log('RESPONSE', { source: 'http', level, requestId, method: req.method, url: req.url, userName: req.userName, statusCode: res.statusCode, latencyMs: responseTime, contentLength });
				});

				next();
			});

			// Apply middleware
			if (this.serverConfig.cors)
			{
				this.app.use(cors());
			}

			// Basic security headers
			this.app.use(helmet({
				contentSecurityPolicy: false,   // Disabled for development, enable in production
				frameguard: false               // Disable X-Frame-Options to allow embedding in iframes
			}));

			// Body parsers for JSON and URL-encoded payloads (dev limits)
			this.app.use(express.json({ limit: '10mb' }));
			this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

			// Public contact endpoint for website contact form
			this.app.post('/contact', async (req, res) =>
			{
				try
				{
					const body = req && req.body ? req.body : {};
					const name = (body.name || '').trim();
					const email = (body.email || '').trim();
					const message = (body.message || '').trim();
					const consent = !!body.consent;
					const captchaToken = body.captchaToken || body['cf-turnstile-response'] || '';

					if (!name || !email || !message || !consent)
					{
						return fail(res, 'invalid_payload', 'Missing required contact fields');
					}
					if (!captchaToken)
					{
						return fail(res, 'missing_captcha', 'Missing CAPTCHA token');
					}

					const clientIp = req.clientIp || '';
					let verification = null;
					try
					{
						if (!this.awi.cloudfare)
						{
							this.awi.log('Cloudfare connector not available', { source: 'http', level: 'error', functionName: 'contact', clientIp });
							return fail(res, 'captcha_service_unavailable', 'CAPTCHA service unavailable', 500);
						}
						const ans = await this.awi.cloudfare.command_verifyTurnstile({ token: captchaToken, ip: clientIp }, {}, null);
						if (ans.isError())
							verification = ans.data || { success: false };
						else
							verification = ans && ans.data ? ans.data : null;
					}
					catch (e)
					{
						this.awi.log('Cloudfare verification error', { source: 'http', level: 'error', functionName: 'contact', clientIp, ...safeErr(e) });
						verification = { success: false };
					}
					if (!verification || !verification.success)
					{
						this.awi.log('Turnstile verification failed', { source: 'http', level: 'warning', functionName: 'contact', clientIp });
						return fail(res, 'captcha_failed', 'CAPTCHA verification failed');
					}

					// At this point the CAPTCHA is valid. In the future this can send an email or store in a database.
					this.awi.log('CONTACT message received', { source: 'http', level: 'info', functionName: 'contact', clientIp, name, email });
					return ok(res, { received: true });
				}
				catch (e)
				{
					this.awi.log('CONTACT handler error', { source: 'http', level: 'error', functionName: 'contact', ...safeErr(e) });
					return fail(res, 'contact_error', 'Unexpected error processing contact request', 500);
				}
			});

			// Base router for AWI REST
			const apiBase = this.routerBase;
			const awiRouter = express.Router();

			// Configure multer for large payloads (disk storage in uploads/tmp)
			var tempPath = this.tempPath;
			try { fs.mkdirSync(tempPath, { recursive: true }); } catch(e) {}
			const storage = multer.diskStorage({
				destination: (req, file, cb) => cb(null, tempPath),
				filename: (req, file, cb) =>
				{
					const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
					// Decode URL-encoded characters (e.g., %20 -> space)
					const decodedName = file.originalname ? decodeURIComponent(file.originalname) : 'upload.bin';
					cb(null, unique + '-' + decodedName);
				}
			});
			this._upload = multer({
				storage,
				limits: {
					fileSize: 1024 * 1024 * 1024, // 1 GB per file (dev)
					fieldSize: 50 * 1024 * 1024, // 50 MB for field values
					fields: 20 // Max number of non-file fields
				}
			});

			// Helper: response envelope
			const ok = (res, data = undefined) => res.status(200).json({ success: true, data });
			const fail = (res, code = 'bad_request', message = 'Bad request', status = 400) => res.status(status).json({ success: false, error: { code, message } });

			// Dev-only REST key validator (64 hex chars)
			let userConfig = null;
			const requireRestKey = (req, res, next) =>
			{
				try
				{
					let key = req.header('X-REST-Key');
					if (!key)
					{
						const auth = req.header('Authorization');
						if (auth && auth.startsWith('Bearer '))
						{
							key = auth.substring('Bearer '.length).trim();
						}
					}
					if (!key)
					{
						return fail(res, 'missing_rest_key', 'Missing REST key', 401);
					}
					if (typeof key !== 'string' || key.length !== 128 || !/^[a-fA-F0-9]{128}$/.test(key))
					{
						return fail(res, 'invalid_rest_key', 'Invalid REST key format', 401);
					}
					var userName = this.keyToUserName[ key ];
					if (!userName)
					{
						return fail(res, 'invalid_rest_key', 'Invalid REST key', 401);
					}
					//userConfig = this.awi.configuration.getUserConfig( userName );
					//if (!userConfig) return fail(res, 'user_not_found', 'User not found', 401);
					req.restKey = key;
					req.userConfig = userConfig;
					req.userName = userName;
					return next();
				}
				catch (e)
				{
					return fail(res, 'rest_key_error', 'Error validating REST key', 401);
				}
			};
			// Keep for later use by addRestRoute
			this._requireRestKey = requireRestKey;

			// Chunked upload handler with error handling
			awiRouter.post('/chunk-upload', requireRestKey, (req, res, next) => {
				this._upload.any()(req, res, (err) => {
					if (err) {
						this.awi.log('CHUNK MULTER ERROR', { source: 'http', level: 'error', userName: req.userName, ...safeErr(err) });
						return fail(res, 'chunk_upload_error', err.message || 'Chunk upload failed', 400);
					}
					next();
				});
			}, async (req, res) =>
			{
				try
				{
					const uploadId = req.header('X-Chunk-Upload-ID');
					const chunkIndex = parseInt(req.header('X-Chunk-Index'), 10);
					const totalChunks = parseInt(req.header('X-Chunk-Total'), 10);
					// Decode URL-encoded filename from header
					const filename = req.header('X-Chunk-Filename') ? decodeURIComponent(req.header('X-Chunk-Filename')) : null;
					const originalEndpoint = req.header('X-Original-Endpoint');
					this.awi.log('CHUNK received', { source: 'http', level: 'info', userName: req.userName, uploadId, chunkIndex, totalChunks });

					if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !filename || !originalEndpoint)
					{
						this.awi.log('Invalid chunk headers', { source: 'http', level: 'error', userName: req.userName });
						return fail(res, 'invalid_chunk_headers', 'Missing or invalid chunk headers', 400);
					}

					// Get or create chunk session
					let session = this.chunkSessions.get(uploadId);
					if (!session)
					{
						this.awi.log('CHUNK new session', { source: 'http', level: 'info', userName: req.userName, uploadId, totalChunks });
						const chunksDir = path.join(this.tempPath, 'chunks', uploadId);
						try { fs.mkdirSync(chunksDir, { recursive: true }); } catch(e) {}
						
						session = {
							uploadId,
							totalChunks,
							receivedChunks: new Set(),
							chunkPaths: new Map(),
							originalEndpoint,
							filename,
							parameters: null,
							timestamp: Date.now(),
							chunksDir
						};
						this.chunkSessions.set(uploadId, session);
					}

					// Save chunk to disk
					const files = Array.isArray(req.files) ? req.files : [];
					if (files.length === 0)
					{
						this.awi.log('No chunk data received', { source: 'http', level: 'error', userName: req.userName });
						return fail(res, 'no_chunk_data', 'No chunk data received', 400);
					}

					const chunkFile = files[0];
					const chunkPath = path.join(session.chunksDir, `chunk-${chunkIndex}`);
					//console.log(`[SERVER-CHUNK] Saving chunk to: ${chunkPath}, size: ${chunkFile.size} bytes`);
					
					// Move uploaded chunk to session directory
					fs.renameSync(chunkFile.path, chunkPath);
					session.chunkPaths.set(chunkIndex, chunkPath);
					session.receivedChunks.add(chunkIndex);
					this.awi.log('CHUNK saved', { source: 'http', level: 'info', userName: req.userName, uploadId, chunkIndex, received: session.receivedChunks.size, total: totalChunks });

					// Extract parameters from last chunk
					if (chunkIndex === totalChunks - 1)
					{
						const extract = (src) =>
						{
							if (!src) return undefined;
							if (src.parameter !== undefined) return src.parameter;
							if (src.parameters !== undefined) return src.parameters;
							return undefined;
						};
						let raw = extract(req.body);
						if (typeof raw === 'string')
						{
							try { session.parameters = JSON.parse(raw); } catch { session.parameters = {}; }
						}
						else if (raw && typeof raw === 'object')
						{
							session.parameters = raw;
						}
					}

					// Check if all chunks received
					if (session.receivedChunks.size === totalChunks)
					{
						this.awi.log('All chunks received, reassembling file', { source: 'http', level: 'info', userName: req.userName, uploadId, totalChunks });
						// Reassemble file
						const reassembledPath = path.join(this.tempPath, `reassembled-${uploadId}-${filename}`);
						const writeStream = fs.createWriteStream(reassembledPath);
						//console.log(`[SERVER-CHUNK] Reassembling to: ${reassembledPath}`);

						for (let i = 0; i < totalChunks; i++)
						{
							const chunkPath = session.chunkPaths.get(i);
							if (!chunkPath)
							{
								writeStream.close();
								this._cleanupChunkSession(uploadId);
								return fail(res, 'missing_chunk', `Chunk ${i} not found`, 500);
							}
							const chunkData = fs.readFileSync(chunkPath);
							writeStream.write(chunkData);
						}
						writeStream.end();

						// Wait for write to complete
						await new Promise((resolve, reject) =>
						{
							writeStream.on('finish', resolve);
							writeStream.on('error', reject);
						});
						const finalSize = fs.statSync(reassembledPath).size;
						this.awi.log('Reassembly complete', { source: 'http', level: 'info', userName: req.userName, uploadId, finalSize });

						// Create synthetic request for original handler
						const syntheticFiles = [{
							fieldname: 'file',
							originalname: filename,
							encoding: '7bit',
							mimetype: chunkFile.mimetype || 'application/octet-stream',
							path: reassembledPath,
							size: fs.statSync(reassembledPath).size
						}];

						const message = {
							handle: 'http',
							id: this.awi.utilities.getUniqueIdentifier( {}, 'message' ),
							command: originalEndpoint.replace('/conn/', '').replace('/', ':'),
							parameters: (() => {
								// Ensure supabaseTokens present; extract from Authorization if missing
								try {
									const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
									if (auth && !(session.parameters && session.parameters.supabaseTokens)) {
										const m = /^Bearer\s+(.+)$/i.exec(auth);
										const token = m ? m[1] : auth;
										session.parameters = session.parameters || {};
										session.parameters.supabaseTokens = { client_token: token };
									}
								} catch {}
								return session.parameters || {};
							})(),
							files: syntheticFiles,
							userConfig: req.userConfig,
							restKey: req.restKey,
							originalEndpoint: originalEndpoint
						};
						//console.log(`[SERVER-CHUNK] Forwarding to handler: ${message.command}`);

						// Forward to original handler
						const answer = await this.awi.editor.http.onMessage( message );
						//console.log(`[SERVER-CHUNK] Handler response: ${answer.isSuccess() ? 'SUCCESS' : 'FAILED'}`);
						// Cleanup
						this._cleanupChunkSession(uploadId);
						try { fs.unlinkSync(reassembledPath); } catch(e) {}

						if (answer.isSuccess())
						{
							return ok(res, answer.data);
						}
						return fail(res, answer.message, answer.getPrint());
					}
					else
					{
						// Intermediate chunk received successfully
						//console.log(`[SERVER-CHUNK] Intermediate chunk ${chunkIndex} acknowledged`);
						return ok(res, { received: chunkIndex, total: totalChunks });
					}
				}
				catch (err)
				{
					this.awi.log('Chunk upload error', { source: 'http', level: 'error', userName: req.userName, ...safeErr(err) });
					return fail(res, 'chunk_handler_error', err && err.message ? err.message : 'Chunk handler error', 500);
				}
			});

			// Fixed user routes (stubs; to be replaced by Supabase later)
			awiRouter.post('/validateToken', async (req, res) =>
			{
				const { userName, token, awiName } = req.body || {};
				if (!userName || !token || !awiName)
				{
					return fail(res, 'invalid_payload', 'Expected { userName, token, awiName }');
				}
				var answer = await this.awi.authentification.validateToken({ userName, token, awiName });
				if (answer.isSuccess())
				{
					return ok(res, answer.data);
				}
				return fail(res, answer.message, answer.getPrint());
			});

			awiRouter.post('/createAccount', async (req, res) =>
			{
				const { accountInfo, supabaseTokens } = req.body || {};
				if (!accountInfo || !supabaseTokens)
					return fail(res, 'invalid_payload', 'Expected { accountInfo, supabaseTokens }');
				var answer = await this.awi.authentification.createAccount( { accountInfo, supabaseTokens } );
				if (answer.isSuccess())
				{
					const userName = (answer.data && (answer.data.userName || answer.data.username)) || accountInfo.userName || accountInfo.email;
					if (userName && this.awi.thinknotes && typeof this.awi.thinknotes.createUser === 'function')
					{
						const provision = await this.awi.thinknotes.createUser({ userName, accountInfo, supabaseTokens });
						if (provision.isError())
						{
							this.awi.log('Connector createUser failed', { source: 'app', level: 'error', functionName: 'createAccount', userName, ...safeErr(provision.error) });
						}
					}
					return ok(res, answer.data);
				}
				return fail(res, answer.error.code, answer.error.message);
			});

			awiRouter.post('/loginAccount', async (req, res) =>
			{
				const { userName, supabaseTokens } = req.body || {};
				if (!userName || !supabaseTokens)
					return fail(res, 'invalid_payload', 'Expected { userName, supabaseTokens }');
				var answer = await this.awi.authentification.loginAccount( { userName, supabaseTokens } );
				if (answer.isSuccess())
				{
					this.keyToUserName[ answer.data.key ] = userName;
					if (this.awi.thinknotes && typeof this.awi.thinknotes.createUser === 'function')
					{
						const provision = await this.awi.thinknotes.createUser({ userName, supabaseTokens });
						if (provision.isError())
						{
							this.awi.log('Connector createUser failed', { source: 'app', level: 'error', functionName: 'loginAccount', userName, ...safeErr(provision.error) });
						}
					}
					return ok(res, answer.data);
				}
				return fail(res, answer.message, answer.getPrint());
			});

			awiRouter.post('/logoutAccount', async (req, res) =>
			{
				const { userName, token } = req.body || {};
				if (!userName || !token)
				{
					return fail(res, 'invalid_payload', 'Expected { userName, token }');
				}
				var answer = await this.awi.authentification.logoutAccount( { userName, token } );
				if (answer.isSuccess())
				{
					delete this.keyToUserName[ answer.data.key ];
					return ok(res, answer.data);
				}
				return fail(res, answer.message, answer.getPrint());
			});

			awiRouter.get('/getUserInfo', async (req, res) =>
			{
				const { userName, token } = req.query || {};
				if (!userName || !token)
				{
					return fail(res, 'invalid_payload', 'Expected { userName, password, token }');
				}
				var answer = await this.awi.authentification.getUserInfo( { userName, token } );
				if (answer.isSuccess())
				{
					return ok(res, answer.data);
				}
				return fail(res, answer.message, answer.getPrint());
			});

			awiRouter.post('/deleteAccount', async (req, res) =>
			{
				const { userName, token } = req.body || {};
				if (!userName || !token)
				{
					return fail(res, 'invalid_payload', 'Expected { userName, token }');
				}
				var answer = await this.awi.authentification.deleteAccount( { userName, token } );
				if (answer.isSuccess())
				{
					return ok(res, answer.data);
				}
				return fail(res, answer.message, answer.getPrint());
			});

			// Connector-registered routes under /conn/:connector/:function
			// Shared handler for both JSON and multipart
			const connectorHandler = async (req, res) =>
			{
				try
				{
					const connectorToken = req.params.connector;
					const functionName = req.params.function;
					const method = (req.method || 'GET').toUpperCase();
					// Forward all connector calls to AWI editor HTTP handler
					// Routing and permissions are handled downstream in editor.http.onMessage

					// Parameters expected under 'parameter' (primary) or 'parameters' (fallback)
					let parameters = {};
					const extract = (src) =>
					{
						if (!src)
						{
							return undefined;
						}
						if (src.parameter !== undefined)
						{
							return src.parameter;
						}
						if (src.parameters !== undefined)
						{
							return src.parameters;
						}
						return undefined;
					};
					let raw = extract(req.body);
					if (raw === undefined)
					{
						raw = extract(req.query);
					}
					if (typeof raw === 'string')
					{
						try { parameters = JSON.parse(raw); } catch { parameters = {}; }
					}
					else if (raw && typeof raw === 'object')
					{
						parameters = raw;
					}

					try {
						const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || null;
						if (auth && !parameters.supabaseTokens)
						{
							const m = /^Bearer\s+(.+)$/i.exec(auth);
							const token = m ? m[1] : auth;
							parameters.supabaseTokens = { client_token: token };
						}
					} catch {}

					const files = Array.isArray(req.files) ? req.files : [];
					var message = {
						handle: 'http',
						id: this.awi.utilities.getUniqueIdentifier( {}, 'message' ),
						command: connectorToken + ':' + functionName,
						parameters: parameters,
						files: files,
						userConfig: req.userConfig
					};
					var answer = await this.awi.editor.http.onMessage( message );
					if (answer.isSuccess())
					{
						return ok(res, answer.data);
					}
					return fail(res, answer.message, answer.getPrint());
				}
				catch (err)
				{
					return fail(res, 'handler_error', err && err.message ? err.message : 'Handler error', 500);
				}
			};

			// Multipart/form-data route (place before generic to take precedence for POST)
			// Add error handler for multer
			awiRouter.post('/conn/:connector/:function', requireRestKey, (req, res, next) => {
				this._upload.any()(req, res, (err) => {
					if (err) {
						this.awi.log('MULTER ERROR', { source: 'http', level: 'error', userName: req.userName, ...safeErr(err) });
						if (err.code === 'LIMIT_FILE_SIZE') {
							return fail(res, 'file_too_large', `File exceeds maximum size limit`, 413);
						}
						return fail(res, 'upload_error', err.message || 'File upload failed', 400);
					}
					next();
				});
			}, connectorHandler);
			// Generic route for JSON or query-based parameters
			awiRouter.all('/conn/:connector/:function', requireRestKey, connectorHandler);

			// Mount base router and keep a reference for later registrations
			this._awiRouter = awiRouter;
			this.app.use(apiBase, awiRouter);

			// Signed URL download endpoint for secure file access
			this.app.get('/download/:token', async (req, res) =>
			{
				try
				{
					const token = req.params.token;
					const storage = this.awi.storage;
					
					if (!storage || !storage.validateDownloadToken)
					{
						this.awi.log('Download endpoint: storage connector not available', { source: 'http', level: 'error' });
						return res.status(500).json({ error: 'Storage not configured' });
					}
					
					// Validate token
					const tokenData = storage.validateDownloadToken(token);
					if (!tokenData)
					{
						this.awi.log('Download endpoint: invalid or expired token', { source: 'http', level: 'warning', token: token.substring(0, 8) + '...' });
						return res.status(410).json({ error: 'Token expired or invalid' });
					}
					
					// Check file exists
					const exists = await this.awi.system.exists(tokenData.path);
					if (!exists.isSuccess())
					{
						storage.consumeDownloadToken(token);
						this.awi.log('Download endpoint: file not found', { source: 'http', level: 'error', path: tokenData.path });
						return res.status(404).json({ error: 'File not found' });
					}
					
					// Get file stats for Content-Length
					const stats = await this.awi.system.stat(tokenData.path);
					const fileSize = stats.isSuccess() ? stats.data.size : 0;
					
					// Set headers for streaming download
					res.setHeader('Content-Type', tokenData.mimeType || 'audio/mpeg');
					res.setHeader('Content-Disposition', `attachment; filename="${this.awi.system.basename(tokenData.path)}"`);
					if (fileSize > 0)
						res.setHeader('Content-Length', fileSize);
					
					// Stream file to client
					const stream = fs.createReadStream(tokenData.path);
					stream.on('error', (err) =>
					{
						this.awi.log('Download endpoint: stream error', { source: 'http', level: 'error', error: err.message });
						if (!res.headersSent)
							res.status(500).json({ error: 'Stream error' });
					});
					stream.on('end', () =>
					{
						this.awi.log('Download endpoint: file streamed successfully', { source: 'http', level: 'info', identifier: tokenData.identifier });
					});
					stream.pipe(res);
					
					// Consume token after successful stream start (one-time use)
					// Note: We don't consume immediately to allow retry on network issues
					// Token will expire naturally after 5 minutes
				}
				catch (error)
				{
					this.awi.log('Download endpoint: unexpected error', { source: 'http', level: 'error', error: error.message });
					if (!res.headersSent)
						res.status(500).json({ error: 'Download failed' });
				}
			});

			// Serve static files
			const rootDir = path.resolve(this.serverConfig.rootDirectory);
			
			const staticOptions = {
				setHeaders: (res, filePath) =>
				{
					const ext = filePath.split('.').pop().toLowerCase();
					const mimeTypes = {
						'html': 'text/html',
						'css': 'text/css',
						'js': 'application/javascript',
						'jpg': 'image/jpeg',
						'jpeg': 'image/jpeg',
						'png': 'image/png',
						'gif': 'image/gif',
						'svg': 'image/svg+xml',
						'webp': 'image/webp',
						'mp4': 'video/mp4',
						'mp3': 'audio/mpeg',
						'wav': 'audio/wav',
						'ogg': 'audio/ogg',
						'json': 'application/json',
						'hjson': 'application/hjson',
						'csv': 'text/csv',
						'txt': 'text/plain',
					};
					if (mimeTypes[ext])
					{
						res.setHeader('Content-Type', mimeTypes[ext]);
					}
				}
			};

			const defaultStatic = express.static(rootDir, staticOptions);
			this.app.use((req, res, next) =>
			{
				return defaultStatic(req, res, next);
			});

			// Handle web-hooks
			//this.app.post("/hook", (req, res) =>
			//{
			//	console.log(req.body) // Call your action on the request here
			//	res.status(200).end() // Responding is important
			//})

			// Zoom Webhook endpoint: prefer configuration from zoomrtms connector
			const zoomConn = this.awi && this.awi.zoomrtms ? this.awi.zoomrtms : null;
			const zoomWebhookPath = (zoomConn && zoomConn.getWebhookPath && zoomConn.getWebhookPath()) || process.env.ZOOM_WEBHOOK_PATH || '/webhooks/zoom';
			this.app.post(zoomWebhookPath, async (req, res) =>
			{
				try
				{
					const body = req && req.body ? req.body : {};
					const event = body.event;
					const payload = body.payload || {};

					// URL validation challenge
					if (event === 'endpoint.url_validation' && payload.plainToken)
					{
						const secret = (zoomConn && zoomConn.getSecretToken && zoomConn.getSecretToken()) || process.env.ZOOM_SECRET_TOKEN || 'CHANGE_ME_SECRET_TOKEN';
						const hash = crypto.createHmac('sha256', secret).update(payload.plainToken).digest('hex');
						return res.json({ plainToken: payload.plainToken, encryptedToken: hash });
					}

					// Acknowledge receipt fast
					res.sendStatus(200);

					// Basic routing (now delegates to zoomrtms connector where applicable)
					switch (event)
					{
						case 'meeting.started':
							this.awi.log('Zoom meeting.started', { source: 'app', level: 'info', event: 'meeting.started', meetingId: (payload && payload.object ? payload.object.id : '') });
							try { zoomConn && zoomConn.onMeetingStarted && zoomConn.onMeetingStarted(payload); } catch(e) { this.awi.log('Zoom onMeetingStarted error', { source: 'app', level: 'error', ...safeErr(e) }); }
							break;
						case 'meeting.rtms_started':
							this.awi.log('Zoom meeting.rtms_started', { source: 'app', level: 'info', event: 'meeting.rtms_started', meetingUuid: payload.meeting_uuid });
							try { zoomConn && zoomConn.onRtmsStarted && zoomConn.onRtmsStarted(payload); } catch(e) { this.awi.log('Zoom onRtmsStarted error', { source: 'app', level: 'error', ...safeErr(e) }); }
							break;
						case 'meeting.rtms_stopped':
							this.awi.log('Zoom meeting.rtms_stopped', { source: 'app', level: 'info', event: 'meeting.rtms_stopped', meetingUuid: payload.meeting_uuid });
							try { zoomConn && zoomConn.onRtmsStopped && zoomConn.onRtmsStopped(payload); } catch(e) { this.awi.log('Zoom onRtmsStopped error', { source: 'app', level: 'error', ...safeErr(e) }); }
							break;
						case 'meeting.ended':
							// TODO: finalize transcript/audio and trigger ThinkNotes compute flow
							this.awi.log('Zoom meeting.ended', { source: 'app', level: 'info', event: 'meeting.ended' });
							try { zoomConn && zoomConn.onMeetingEnded && zoomConn.onMeetingEnded(payload); } catch(e) { this.awi.log('Zoom onMeetingEnded error', { source: 'app', level: 'error', ...safeErr(e) }); }
							break;
						default:
							break;
					}
				}
				catch (e)
				{
					this.awi.log('ZoomWebhook error', { source: 'app', level: 'error', ...safeErr(e) });
					try { res.sendStatus(200); } catch {}
				}
			});

			const workspaceEventsPath = process.env.WORKSPACE_EVENTS_WEBHOOK_PATH || '/workspace-events/pubsub';
			this.app.post(workspaceEventsPath, async (req, res) =>
			{
				try
				{
					const body = req && req.body ? req.body : {};
					res.sendStatus(200);
					const msg = body.message || {};
					const attrs = msg.attributes || {};
					const dataB64 = msg.data || '';
					let event = null;
					try
					{
						const json = Buffer.from(dataB64, 'base64').toString('utf8');
						event = JSON.parse(json);
					}
					catch (e)
					{
						this.awi.log('WorkspaceEvents decode error', { source: 'app', level: 'error', ...safeErr(e) });
						return;
					}
					const eventType = attrs['ce-type'] || '';
					const subscriptionSource = attrs['ce-source'] || '';
					const tn = this.awi && this.awi.thinknotes ? this.awi.thinknotes : null;
					if (tn && typeof tn.onGoogleWorkspaceMeetEvent === 'function')
					{
						await tn.onGoogleWorkspaceMeetEvent({ event, eventType, subscriptionSource, raw: body });
					}
				}
				catch (e)
				{
					this.awi.log('WorkspaceEvents webhook error', { source: 'app', level: 'error', ...safeErr(e) });
					try { res.sendStatus(200); } catch {}
				}
			});

			// Zoom OAuth (user-level) — start: create state and redirect to Zoom authorize
			this.app.get('/zoom/oauth/start', async (req, res) =>
			{
				try
				{
					const z = this.awi && this.awi.zoomrtms ? this.awi.zoomrtms : null;
					const clientId = (z && z.getClientId && z.getClientId()) || process.env.ZOOM_CLIENT_ID || 'CHANGE_ME_CLIENT_ID';
					const redirectUrl = (z && z.getRedirectUrl && z.getRedirectUrl(this.domain)) || process.env.ZOOM_REDIRECT_URL || (this.domain + '/zoom/oauth/callback');
					const scope = (z && z.getOauthScopes && z.getOauthScopes()) || process.env.ZOOM_OAUTH_SCOPES || 'user:read meeting:read';
					const userId = (req.query && (req.query.userId || req.query.user_id)) || null;
					const returnTo = (req.query && (req.query.return_to || req.query.returnTo)) || '/user/settings';
					if (!userId)
					{
						const m = encodeURIComponent('Missing userId');
						return res.redirect(`/zoom/connect/error.html?m=${m}`);
					}
					// Create CSRF state and store it via database connector
					const stateRaw = `${userId}:${Date.now()}:${crypto.randomBytes(12).toString('hex')}`;
					const state = crypto.createHash('sha256').update(stateRaw).digest('hex');
					const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
					if (this.awi && this.awi.database && this.awi.database.upsertOAuthState)
					{
						await this.awi.database.upsertOAuthState({ state, userId, returnTo, expiresAt });
					}
					const params = new URLSearchParams({
						response_type: 'code',
						client_id: clientId,
						redirect_uri: redirectUrl,
						scope,
						state
					});
					const authorizeUrl = `https://zoom.us/oauth/authorize?${params.toString()}`;
					return res.redirect(authorizeUrl);
				}
				catch (e)
				{
					const m = encodeURIComponent((e && e.message) ? e.message : String(e));
					return res.redirect(`/zoom/connect/error.html?m=${m}`);
				}
			});

			// Zoom OAuth callback — validate state, exchange code, store tokens, and redirect
			this.app.get('/connect/zoom/oauth/callback', async (req, res) =>
			{
				try
				{
					const z = this.awi && this.awi.zoomrtms ? this.awi.zoomrtms : null;
					const clientId = (z && z.getClientId && z.getClientId()) || process.env.ZOOM_CLIENT_ID || 'CHANGE_ME_CLIENT_ID';
					const clientSecret = (z && z.getClientSecret && z.getClientSecret()) || process.env.ZOOM_CLIENT_SECRET || 'CHANGE_ME_CLIENT_SECRET';
					const redirectUrl = (z && z.getRedirectUrl && z.getRedirectUrl(this.domain)) || process.env.ZOOM_REDIRECT_URL || (this.domain + '/zoom/oauth/callback');
					const code = req.query && req.query.code ? req.query.code : '';
					const state = req.query && req.query.state ? req.query.state : '';
					if (!code || !state)
					{
						const m = encodeURIComponent('Missing code or state');
						return res.redirect(`/zoom/connect/error.html?m=${m}`);
					}
					// Validate state and get associated user
					let stateRow = null;
					if (this.awi && this.awi.database && this.awi.database.getAndDeleteOAuthState)
					{
						const st = await this.awi.database.getAndDeleteOAuthState({ state });
						if (st && st.isSuccess && st.isSuccess()) stateRow = st.data;
					}
					if (!stateRow || (stateRow.expires_at && Date.now() > Number(stateRow.expires_at)))
					{
						const m = encodeURIComponent('Invalid or expired state');
						return res.redirect(`/zoom/connect/error.html?m=${m}`);
					}
					const userId = stateRow.user_id;
					const returnTo = stateRow.return_to || '/user/settings';

					// Exchange code for tokens
					const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
					const tokenUrl = `https://zoom.us/oauth/token?grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUrl)}`;
					const resp = await fetch(tokenUrl, {
						method: 'POST',
						headers: {
							'Authorization': `Basic ${basic}`,
							'Content-Type': 'application/x-www-form-urlencoded'
						}
					});
					if (!resp.ok)
					{
						let reason = '';
						try { reason = await resp.text(); } catch {}
						const m = encodeURIComponent(`Token exchange failed (${resp.status})`);
						return res.redirect(`/zoom/connect/error.html?m=${m}`);
					}
					const tok = await resp.json();
					const expiresAt = Date.now() + Math.max(0, (tok.expires_in || 3600) * 1000 - 60000);

					// Optionally get Zoom user id
					let zoomUserId = null;
					try
					{
						const meResp = await fetch('https://api.zoom.us/v2/users/me', {
							method: 'GET',
							headers: { 'Authorization': `Bearer ${tok.access_token}` }
						});
						if (meResp.ok)
						{
							const me = await meResp.json();
							zoomUserId = me && (me.id || me.userId) ? (me.id || me.userId) : null;
						}
					}
					catch {}

					// Store tokens via database connector
					if (this.awi && this.awi.database && this.awi.database.upsertZoomTokens)
					{
						await this.awi.database.upsertZoomTokens({
							userId,
							tokens: {
								zoom_user_id: zoomUserId,
								access_token: tok.access_token,
								refresh_token: tok.refresh_token,
								expires_at: expiresAt,
								scope: tok.scope,
								token_type: tok.token_type,
								account_id: tok.account_id
							}
						});
					}

					// Redirect back to app
					return res.redirect(returnTo);
				}
				catch (e)
				{
					const m = encodeURIComponent((e && e.message) ? e.message : String(e));
					return res.redirect(`/zoom/connect/error.html?m=${m}`);
				}
			});

			// Handle SPA routing (for Vite and other modern frameworks)
			// Send all non-API requests to index.html
			this.app.use((req, res, next) =>
			{
				// Skip API routes or actual files
				if (req.url.startsWith(apiBase) || req.url.includes('.'))
				{
					return next();
				}

				// Skip URLs with protocols that might cause path-to-regexp errors
				if (req.url.includes('://'))
				{
					return res.status(400).send('Invalid URL format');
				}

				const indexPath = path.join(rootDir, 'index.html');
				if (fs.existsSync(indexPath))
				{
					return res.sendFile(indexPath);
				}
				next();
			});

			// Create HTTP server
			if (this.serverConfig.enableHttp)
			{
				this.httpServer = http.createServer(this.app);
				// Set timeout to 10 minutes for large uploads
				this.httpServer.timeout = 10 * 60 * 1000;
				this.httpServer.keepAliveTimeout = 65000;
				this.httpServer.headersTimeout = 66000;
				this.httpServer.listen(this.serverConfig.port, '0.0.0.0', async () =>
				{
					this.awi.log( this.awi.messages.getMessage( 'awi:server-start', { name: 'HTTP Server', port: this.serverConfig.port } ), { source: 'http', level: 'success info', className: this.className, functionName: 'connect' } );	
					countComplete++;
				});
			}

			// Start file watcher if enabled
			//if (this.serverConfig.watchFiles) {
			//    this.setupFileWatcher();
			//}

			// Start periodic cleanup of stale chunk sessions
			this._chunkCleanupInterval = setInterval(() =>
			{
				this._cleanupStaleChunkSessions();
			}, 15 * 60 * 1000); // Every 15 minutes

			// Start HTTPS server if enabled
			if (this.serverConfig.enableHttps &&
				this.serverConfig.httpsOptions.key &&
				this.serverConfig.httpsOptions.cert)
			{

				const httpsOptions = {
					key: fs.readFileSync(this.serverConfig.httpsOptions.key),
					cert: fs.readFileSync(this.serverConfig.httpsOptions.cert)
				};

				this.httpsServer = https.createServer(httpsOptions, this.app);
				// Set timeout to 10 minutes for large uploads
				this.httpsServer.timeout = 10 * 60 * 1000;
				this.httpsServer.keepAliveTimeout = 65000;
				this.httpsServer.headersTimeout = 66000;

				var self = this;
				this.httpsServer.listen(this.serverConfig.httpsPort, () =>
				{
					this.awi.log( this.awi.messages.getMessage( 'awi:server-start', { name: 'HTTPS Server', port: this.serverConfig.httpsPort } ), { source: 'http', level: 'success info', className: this.className, functionName: 'connect' } );
					countComplete++;
				});
			}
		}
		catch (error)
		{
			this.awi.log( this.awi.messages.getMessage( 'awi:server-error', { name: 'HTTP Server', port: this.serverConfig.port } ), { source: 'http', level: 'error', className: this.className, functionName: 'connect', errorMessage: (error && error.message) ? ('' + error.message) : '' } );
			countComplete++;
		}
		while ( countComplete < toComplete )
		{
			await this.awi.utilities.sleep( 100 );
		}
		this.setConnected(true);
	}

	async printStartupBanner()
	{
		const port = this.serverConfig.port;
		const projectName = this.serverConfig.projectName || 'AWI SERVER';
		let banner;
		
		// Setup mode if database is missing (delayed) OR (present but not configured)
		if (!this.awi.database || (!this.awi.database.url || !this.awi.database.secretKey))
		{
			banner = [
				"\n",
				"********************************************************************",
				"*                                                                  *",
				`*  ${projectName.toUpperCase().padEnd(64)}*`,
        "*                                                                  *",
        "*  AWI - Written by Francois Lionet (c) 2025                       *",
        "*  System ready, waiting for configuration.                        *",
				"*                                                                  *",
				"********************************************************************",
				"\n"
			].join('\n');
		}
		else
		{
			banner = [
				"\n",
				"********************************************************************",
				"*                                                                  *",
				`*  ${projectName.toUpperCase().padEnd(64)}*`,
				"*  OPERATIONAL                                                     *",
				"*                                                                  *",
				`*  Listening on http://localhost:${port}                           *`,
				"*                                                                  *",
				"********************************************************************",
				"\n"
			].join('\n');
		}
			
		if (this.awi.editor)
		{
			await this.awi.editor.print(banner);
		}
		else
		{
			console.log(banner); // Fallback
		}
	}

	addWebhook( name, callback )
	{
		var id = this.awi.utilities.getUniqueIdentifier( this.webhooks, name );
		this.webhooks[ id ] = {
			id: id,
			name: name,
			url: this.domain + '/hook',
			callback: callback
		};
		return this.newAnswer( this.webhooks[ id ] );
	}
	removeWebhook( id )
	{
		if (!this.webhooks[ id ])
			return this.newError( { message: 'awi:webhook-not-found', data: id } );
		delete this.webhooks[ id ];
		return this.newAnswer( true );
	}
	setupFileWatcher()
	{
		const rootDir = path.resolve(this.serverConfig.rootDirectory);

		this.watcher = chokidar.watch(rootDir, this.serverConfig.watchOptions);

		// File change events
		const handleChange = (filePath) =>
		{
			this.notifyClientsOfChange(filePath);
		};

		this.watcher.on('change', handleChange);
		this.watcher.on('add', handleChange);
		this.watcher.on('unlink', handleChange);
	}

	notifyClientsOfChange(filePath)
	{
	}

	// Get server instance for external use
	getExpressApp()
	{
		return this.app;
	}

	getHttpServer()
	{
		return this.httpServer;
	}

	getHttpsServer()
	{
		return this.httpsServer;
	}

	async quit(options)
	{
		super.quit(options);

		try
		{
			// Stop chunk cleanup interval
			if (this._chunkCleanupInterval)
			{
				clearInterval(this._chunkCleanupInterval);
				this._chunkCleanupInterval = null;
			}

			// Cleanup all chunk sessions
			for (const uploadId of this.chunkSessions.keys())
			{
				this._cleanupChunkSession(uploadId);
			}

			// Close file watcher
			if (this.watcher)
			{
				await this.watcher.close();
				this.watcher = null;
			}

			// Close HTTP server
			if (this.httpServer)
			{
				await new Promise((resolve) =>
				{
					this.httpServer.close(() =>
					{
						resolve();
					});
				});
				this.httpServer = null;
			}

			// Close HTTPS server
			if (this.httpsServer)
			{
				await new Promise((resolve) =>
				{
					this.httpsServer.close(() =>
					{
						resolve();
					});
				});
				this.httpsServer = null;
			}

			return this.setConnected(false);

		}
		catch (error)
		{
			return this.setConnected(false);
		}
	}
	getPort( argsIn )
	{
		return this.serverConfig.port;
	}
	getRootDirectory( argsIn )
	{
		return this.serverConfig.rootDirectory;
	}
	_cleanupChunkSession( uploadId )
	{
		const session = this.chunkSessions.get(uploadId);
		if (!session)
		{
			return;
		}

		// Delete all chunk files
		for (const chunkPath of session.chunkPaths.values())
		{
			try { fs.unlinkSync(chunkPath); } catch(e) {}
		}

		// Delete chunks directory
		try { fs.rmdirSync(session.chunksDir); } catch(e) {}

		// Remove session
		this.chunkSessions.delete(uploadId);
	}
	_cleanupStaleChunkSessions()
	{
		const MAX_SESSION_AGE = 60 * 60 * 1000; // 1 hour
		const now = Date.now();

		for (const [uploadId, session] of this.chunkSessions.entries())
		{
			if (now - session.timestamp > MAX_SESSION_AGE)
			{
				console.log(`Cleaning up stale chunk session: ${uploadId}`);
				this._cleanupChunkSession(uploadId);
			}
		}
	}
}
