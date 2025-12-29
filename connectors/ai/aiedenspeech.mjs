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
* @file speech.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Speech connector, all AI speech-related functions
*
*/
import ConnectorAIBase from './aibase.mjs'
import axios from 'axios'
import fs from 'fs'
import FormData from 'form-data'
import crypto from 'crypto'

export { ConnectorAISpeech as Connector }
class ConnectorAISpeech extends ConnectorAIBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'Speech';
		this.token = 'aispeech';
		this.group = 'ai';
		this.classname = 'ConnectorAISpeech';
		this.version = '0.5';
		this.edenAiHookKey = null;
		this.aiKey = '';
	}
	async connect( options )
	{
		super.connect( options );
		this.aiKey = options.aiKey || this.aiKey || '';

		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.speechToText = this.command_speechToText.bind(this);
		// Compatibility with reference connector
		info[ this.token ].commands.command_transcribe = this.command_transcribe.bind(this);
		info[ this.token ].commands.getDefaultOptions = this.getDefaultOptions.bind(this);
		info[ this.token ].commands.command_computeDefaultOptions = this.command_computeDefaultOptions.bind(this);
		info[ this.token ].commands.command_uploadSound = this.command_uploadSound.bind(this);
		return this.newAnswer( info );
	}
	async setUser( args, basket, control )
	{
		return super.setUser( args, basket, control );
	}
	async getConfig( options )
	{
		var answer = await this.awi.configuration.getToolConfiguration( this.token, 'edenAi' );
		var config = answer.getValue();
		config = {
			...config,
			...options
		};
		return config;
	}
	checkHook( data )
	{
		// we select the SHA 256 algorithm
		const verify = crypto.createVerify('sha256');

		// We hash the payload with an indent of 2,to ensure having the same format as in server side
		const hashed_payload = crypto.createHash('sha256')
			.update(JSON.stringify(data, null, 2))
			.digest('hex');

		verify.update(hashed_payload);
		verify.end();

		// we build the key Object
		var key = this.awi.configuration.edenAiHookKey;
		const Key = {
			key: key, // the public key shown above
			padding: crypto.constants.RSA_PKCS1_PADDING
		};

		// getting the signature in a buffer
		const signatureBuffer = Buffer.from(data.signature, "hex");

		// Now, we can check the signature using the built key and the buffer containing the signature
		const verified = verify.verify(key, signatureBuffer);

		return this.newAnswer(verified === true);
	}

	/////////////////////////////////////////////////////////////////////////
	async command_speechToText(parameters, message, editor)
	{
		var answer = await this.speechToText(parameters);
		if (answer.isSuccess())
			return this.replySuccess(answer, message, editor);
		return this.replyError(answer, message, editor);
	}
	async command_uploadSound(parameters, message, editor)
	{
		// Compatibility shim: return a URL reachable by EdenAI via our HTTP server.
		// This keeps the legacy flow working while we migrate.
		try
		{
			const soundPath = parameters?.soundPath || null;
			if (!soundPath)
				return this.replyError(this.newError({ message: 'awi:missing-argument', data: 'soundPath' }, { functionName: 'command_uploadSound' }), message, editor);
			const rootDirectory = this.awi.http.rootDirectory;
			const domain = this.awi.http.domain;

			const fileName = 'awistt-' + Date.now() + this.awi.system.extname(soundPath);
			const tempPath = rootDirectory + '/' + fileName;
			const copyRes = await this.awi.system.copyFile(soundPath, tempPath);
			if (copyRes && typeof copyRes.isError === 'function' && copyRes.isError())
				return this.replyError(this.newError({ message: 'awi:upload-sound-error', data: copyRes.getPrint ? copyRes.getPrint() : copyRes }, { functionName: 'command_uploadSound' }), message, editor);
			await this.awi.utilities.sleep(250);
			const url = domain + '/' + fileName;
			return this.replySuccess(this.newAnswer(url, { functionName: 'command_uploadSound' }), message, editor);
		}
		catch(e)
		{
			return this.replyError(this.newError({ message: 'awi:upload-sound-error', data: e?.message || e }, { functionName: 'command_uploadSound' }), message, editor);
		}
	}
	async command_computeDefaultOptions(parameters, message, editor)
	{
		// Minimal compatibility: Client expects this call to exist.
		const data = {
			transcription: { options: {}, metadata: [] }
		};
		return this.replySuccess(this.newAnswer(data, { functionName: 'command_computeDefaultOptions' }), message, editor);
	}
	async getDefaultOptions(type, options)
	{
		// Minimal compatibility: return the provided options and empty metadata.
		return this.newAnswer({ options: options || {}, metadata: [] }, { functionName: 'getDefaultOptions' });
	}
	async command_transcribe(parameters, message, editor)
	{
		try
		{
			const soundPath = parameters?.soundPath || null;
			const audioUrl = parameters?.audioUrl || null;
			const options = parameters?.options || {};
			if (!soundPath && !audioUrl)
				return this.replyError(this.newError({ message: 'awi:missing-argument', data: 'soundPath|audioUrl' }, { functionName: 'command_transcribe' }), message, editor);

			const answer = await this.transcribe({ soundPath, audioUrl, options });
			if (answer.isSuccess())
				return this.replySuccess(answer, message, editor);
			return this.replyError(answer, message, editor);
		}
		catch(e)
		{
			return this.replyError(this.newError({ message: 'awi:transcription-error', data: e?.message || e }, { functionName: 'command_transcribe' }), message, editor);
		}
	}
	async transcribe(args)
	{
		const options = args?.options || {};
		const provider = options.provider || 'assembly';
		const language = options.language || 'en';

		const toTranscription = (jobId, sub, full) =>
		{
			const text = sub?.text || sub?.transcription || sub?.transcript || full?.text || full?.transcription || full?.transcript || '';
			const utterances = sub?.utterances || full?.utterances || null;
			return {
				id: jobId,
				text: text,
				utterances: utterances
			};
		};

		// Prefer explicit key passed from node prompt, fallback to configuration connector.
		let key = this.aiKey || '';
		if (!key)
		{
			const configKey = await this.awi.configuration.getToolConfiguration( 'configuration', 'edenAi' );
			if ( configKey.isSuccess() && configKey.getValue() && configKey.getValue().key )
				key = configKey.getValue().key;
		}
		if (!key)
			return this.newError({ message: 'awi:missing-edenai-key', data: 'EDEN_AI_KEY' }, { functionName: 'transcribe' });

		let fileUrl = args.audioUrl || null;
		if (!fileUrl && args.soundPath)
		{
			// Expose local file via httpserver so EdenAI can fetch it.
			const rootDirectory = this.awi.http.rootDirectory;
			const domain = this.awi.http.domain;

			const fileName = 'awistt-' + Date.now() + this.awi.system.extname(args.soundPath);
			const tempPath = rootDirectory + '/' + fileName;
			const copyRes = await this.awi.system.copyFile(args.soundPath, tempPath);
			if (copyRes && typeof copyRes.isError === 'function' && copyRes.isError())
				return this.newError({ message: 'awi:upload-sound-error', data: copyRes.getPrint ? copyRes.getPrint() : copyRes }, { functionName: 'transcribe' });
			await this.awi.utilities.sleep(250);
			fileUrl = domain + '/' + fileName;
		}
		if (!fileUrl)
			return this.newError({ message: 'awi:missing-argument', data: 'file_url' }, { functionName: 'transcribe' });

		const startOptions = {
			method: 'POST',
			url: 'https://api.edenai.run/v2/audio/speech_to_text_async',
			headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
			data: {
				providers: provider,
				language: language,
				file_url: fileUrl,
			}
		};

		let jobId = null;
		try
		{
			const startRes = await axios.request(startOptions);
			jobId = startRes?.data?.job_id || startRes?.data?.public_id || startRes?.data?.id || null;
			if (!jobId && startRes?.data?.results && startRes?.data?.results[ provider ])
				return this.newAnswer(startRes.data.results[ provider ], { functionName: 'transcribe' });
		}
		catch(err)
		{
			const errMsg = err?.response?.data || err?.message || err;
			return this.newError({ message: 'awi:speech-to-text-error', data: errMsg }, { functionName: 'transcribe' });
		}

		if (!jobId)
			return this.newError({ message: 'awi:speech-to-text-error', data: 'missing-job-id' }, { functionName: 'transcribe' });

		// Poll until done (sync server behavior).
		const retrieveUrl = 'https://api.edenai.run/v2/audio/speech_to_text_async/' + jobId;
		for (let i = 0; i < 180; i++)
		{
			await this.awi.utilities.sleep(1000);
			try
			{
				const res = await axios.get(retrieveUrl, { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
				const data = res?.data || {};
				const p = provider;
				const sub = (data.results && data.results[p]) ? data.results[p] : (data[p] || null);
				const status = (data.status || sub?.status || '').toLowerCase();
				if (status && [ 'finished', 'succeeded', 'success', 'completed', 'done' ].includes(status))
					return this.newAnswer( toTranscription(jobId, sub || {}, data), { functionName: 'transcribe' } );
				if (status && [ 'failed', 'error' ].includes(status))
					return this.newError({ message: 'awi:speech-to-text-error', data: sub || data }, { functionName: 'transcribe' });
				// Some providers return final payload without status; detect presence of text.
				const text = sub?.text || sub?.transcription || sub?.transcript || null;
				if (text)
					return this.newAnswer( toTranscription(jobId, sub || {}, data), { functionName: 'transcribe' } );
			}
			catch(e)
			{
				// keep polling
			}
		}
		return this.newError({ message: 'awi:speech-to-text-timeout', data: { jobId: jobId, provider: provider } }, { functionName: 'transcribe' });
	}
	async speechToText( args, basket = {}, control = {} )
	{
		var configKey = await this.awi.configuration.getToolConfiguration( 'configuration', 'edenAi' );
		if ( configKey.isError() )
			return configKey;
		var key = configKey.getValue().key;

		var { audio, isZipped, sourceType, options } = this.awi.getArgs( [ 'audio', 'isZipped', 'sourceType', 'options' ], args, basket, [ '', false, 'base64', {} ] );
		if ( !audio )
			return this.newError( 'awi:missing-argument', 'audio' );
		var config = await this.getConfig( options );

		var aiOptions;
		if ( this.awi.utilities.isUrl(audio) )
		{
			var fileName = 'awistt.' + config.audioFormat;
			var tempPath = this.awi.awi.http.rootDirectory + '/' + fileName;
			if ( sourceType == 'base64' )
			{
				if ( isZipped )
				{
					var answer = await this.awi.zip.unzipBase64ToFile(audio, tempPath);
					if ( answer.isError() )
						return answer;
				}
				else
				{
					// If audio is base64 only, convert it to buffer
					audio = Buffer.from(audio, 'base64');
					fs.writeFileSync(tempPath, audio);
				}
			}
			await this.awi.utilities.sleep(1000);
			var url = this.awi.awi.http.domain + '/' + fileName;
			var data = {
				providers: config.provider,
				language: config.language,
				file_url: url,
				//convert_to_wav: config.convert_to_wav || false,
				//speakers: config.speakers || 1,
				//profanity_filter: config.profanity_filter || false,
			}
			//if ( config.provider_params )
			//    data.provider_params = config.provider_params;
			aiOptions = {
				method: "POST",
				url: "https://api.edenai.run/v2/audio/speech_to_text_async",
				headers: {
					'Authorization': 'Bearer ' + key,
					//'Content-Type': 'application/json'
				},
				data: data,
			};

			// Install webhook
			//var webhook;
			//var answer = await this.awi.awi.http.addWebhook( 'speechToText', function( data )
			//{
			//    console.log( data );
			//} );
			//if ( answer.isError() )
			//    return answer;
			//webhook = answer.getValue();
			//aiOptions.data.webhook_receiver = webhook.url;
			//aiOptions.data.users_webhook_parameters = { 'webhook_key': webhook.id };

		}
		/*
		else
		{
			var tempPath = await this.awi.files.getTempPath('awistt', config.audioFormat);
			tempPath = tempPath.getValue();
			var tempPath = this.awi.awi.http.rootDirectory + '/awistt.' + config.audioFormat;

			// If zipped, unzip!
			if ( sourceType == 'base64' )
			{
				if ( isZipped )
				{
					var answer = await this.awi.zip.unzipBase64ToFile(audio, tempPath);
					if ( answer.isError() )
						return answer;
				}
				else
				{
					// If audio is base64 only, convert it to buffer
					audio = Buffer.from(audio, 'base64');
					fs.writeFileSync(tempPath, audio);
				}
			}

			const form = new FormData();
			form.append("providers", config.provider || 'google');
			form.append("file", fs.createReadStream(tempPath));
			form.append("language", config.language || 'en');
			form.append("convert_to_wav", config.convert_to_wav || false);
			form.append("speakers", config.speakers || 1);
			form.append("profanity_filter", config.profanity_filter || false);
			if ( config.provider_params )
				form.append("provider_params", JSON.stringify(config.provider_params));

			// Install webhook
			var webhook;
			var answer = await this.awi.awi.http.addWebhook( 'speechToText', function( data )
			{
				console.log( data );
			} );
			if ( answer.isError() )
				return answer;
			webhook = answer.getValue();
			//form.append("webhook_receiver", webhook.url);
			//form.append("users_webhook_parameters", JSON.stringify({ 'webhook_key': webhook.id }));

			aiOptions = {
				method: "POST",
				url: "https://api.edenai.run/v2/audio/speech_to_text_async",
				headers: {
					Authorization: 'Bearer ' + key,
					"Content-Type": "multipart/form-data; boundary=" + form.getBoundary(),
				},
				data: form,
			};
		}
		*/
		var self = this;
		return new Promise( function( resolve )
		{
			axios.request( aiOptions )
				.then( function( response )
				{
					resolve( self.newAnswer( response.data.results[ config.provider ] ) );
				} )
				.catch( function( err )
				{
					resolve( self.newError({ message: 'awi:speech-to-text-error', data: err }) );
				} );
		} );
	}
}
