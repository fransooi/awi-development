/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [     ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\_\_/\_\_/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file aiassembly.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short AssemblyAI connector, all AI AssemblyAI-related functions
*
*/
import ConnectorAIBase from './aibase.mjs'
import { AssemblyAI } from "assemblyai";
import axios from "axios";

export { ConnectorAIAssembly as Connector }
class ConnectorAIAssembly extends ConnectorAIBase
{
	constructor( awi, options = {} )
	{
		super( awi, options );
		this.name = 'Assembly';
		this.token = 'aispeech';
		this.group = 'ai';
		this.classname = 'ConnectorAIAssembly';
		this.version = '0.5';
		this.client = null;
		this.apiKey = '';
		this.baseUrl = "https://api.eu.assemblyai.com";
		this.promptPath = '';
		this.costs = {
			transcription: {
				'slam-1': 0.27,
				'universal': 0.27,
				'nano': 0.12,
				'auto_chapters': 0.08,
				'key_phrases': 0.01,
				'entity_detection': 0.08,
				'summarization': 0.03,
				'content_moderation': 0.15,
				'pii_redaction': 0.08,
				'pii_audio_redaction': 0.05,
				'sentiment_analysis': 0.02,
				'topic_detection': 0.15
			},
			input: {
				'anthropic/claude-3-opus': 0.015,
				'anthropic/claude-3-haiku': 0.00025,
				'anthropic/claude-3-5-sonnet': 0.003,
				'anthropic/claude-3-7-sonnet-20250219': 0.003,
				'anthropic/claude-3-5-haiku-20241022': 0.0008,
				'anthropic/claude-sonnet-4-20250514': 0.003,
				'anthropic/claude-opus-4-20250514': 0.015,
			},
			output: {
				'anthropic/claude-3-opus': 0.075,
				'anthropic/claude-3-haiku': 0.00125,
				'anthropic/claude-3-5-sonnet': 0.015,
				'anthropic/claude-3-7-sonnet-20250219': 0.015,
				'anthropic/claude-3-5-haiku-20241022': 0.004,
				'anthropic/claude-sonnet-4-20250514': 0.015,
				'anthropic/claude-opus-4-20250514': 0.075,
			}
		}
		this.defaultOptions = {
			transcription: {
				options: {},
				metadata: [ {
					key: 'group_transcription',
					type: 'group',
					defaultValue: 'opened',
					readableName: 'AssemblyAI Transcription',
					description: '',
					data: [
						{
							key: 'speech_model',
							type: 'stringcombo',
							possibleValues: ['universal', 'slam-1'],
							defaultValue: 'universal',
							readableName: 'Speech Model',
							description: 'The speech model to use (universal: ~{universal}~$/hour, slam-1: ~{slam-1}~$/hour)',
						},
						{
							key: 'speaker_labels',
							type: 'boolean',
							defaultValue: true,
							readableName: 'Speaker Labels',
							description: 'Enable detection of speakers',
						},
						{
							key: 'punctuate',
							type: 'boolean',
							defaultValue: true,
							readableName: 'Punctuate',
							description: 'Enable automatic punctuation',
						},
						{
							key: 'format_text',
							type: 'boolean',
							defaultValue: true,
							readableName: 'Format Text',
							description: 'Enable automatic text formatting',
						},
						{
							key: 'disfluencies',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Disfluencies',
							description: 'Enable automatic disfluencies removal',
						},
						{
							key: 'summarization',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Summarization',
							description: 'Enable automatic summarization (~{summarization}~$/hour)',
						},
						{
							key: 'summary_model',
							type: 'stringcombo',
							possibleValues: ['informative', 'conversational', 'catchy'],
							defaultValue: 'informative',
							readableName: 'Summary Model',
							description: 'The model to use for summarization',
						},
						{
							key: 'summary_type',
							type: 'stringcombo',
							possibleValues: ['bullets', 'bullets_verbose', 'gist', 'headline', 'paragraph'],
							defaultValue: 'bullets',
							readableName: 'Summary Type',
							description: 'The type of summary to generate',
						},
						{
							key: 'auto_hilights',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Auto Hilights',
							description: 'Enable automatic hilights detection',
						},
						{
							key: 'auto_chapters',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Auto Chapters',
							description: 'Enable automatic chapter detection (~{auto_chapters}~$/hour)',
						},
						{
							key: 'sentiment_analysis',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Sentiment Analysis',
							description: 'Enable sentiment analysis (~{sentiment_analysis}~$/hour)',
						},
						{
							key: 'filter_profanity',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Filter Profanity',
							description: 'Enable profanity filtering',
						},
						{
							key: 'language_code',
							type: 'stringcombo',
							possibleValues: ['none', 'en_us', 'en_uk', 'fr_fr', 'de_de', 'es_es', 'it_it', 'pt_pt', 'ja_jp', 'zh_cn', 'zh_tw'],
							defaultValue: 'en_us',
							readableName: 'Language Code',
							description: 'The language codes of the audio',
						},
						{
							key: 'language_detection',
							type: 'boolean',
							defaultValue: false,
							readableName: 'Language Detection',
							description: 'Enable automatic language detection',
						},
						{
							key: 'language_detection_threshold',
							type: 'float',
							possibleValues: [0, 1],       // From - To
							defaultValue: 0,
							readableName: 'Language Detection Threshold',
							description: 'The threshold for language detection',
							activatedBy: 'language_code=="none"',
						}
					] }
				]
			},
			summarization: {
				options: {},
				metadata: [ {
					key: 'group_summarization',
					type: 'group',
					defaultValue: 'opened',
					readableName: 'AssemblyAI / Le Mur Summarization',
					description: '',
					data: [
						{
							key: 'final_model',
							type: 'stringcombo',
							possibleValues: [
								'anthropic/claude-3-opus',
								'anthropic/claude-3-haiku',
								'anthropic/claude-3-5-sonnet',
								'anthropic/claude-3-7-sonnet-20250219',
								'anthropic/claude-3-5-haiku-20241022',
								'anthropic/claude-sonnet-4-20250514',
								'anthropic/claude-opus-4-20250514',
							],
							defaultValue: 'anthropic/claude-3-haiku',
							readableName: 'Final Model',
							description: 'The model to use. Costs: \n~{model_costs}~',
						},
						{
							key: 'answer_format',
							type: 'stringcombo',
							possibleValues: ['bullet points', 'TLDR', 'chapters', 'todo list', 'text'],
							defaultValue: '',
							readableName: 'Answer Format',
							description: 'The format of the answer',
						},
						{
							key: 'temperature',
							type: 'float',
							defaultValue: 0.5,
							possibleValues: [0, 1],
							readableName: 'Temperature',
							description: 'The temperature of the output',
						},
						{
							key: 'max_output_size',
							type: 'int',
							defaultValue: 500,
							possibleValues: [350, 1000],
							readableName: 'Max Output Size',
							description: 'The maximum size of the output',
						}
					] }
				]
			},
			question: {
				options: {},
				metadata: [ {
					key: 'group_question',
					type: 'group',
					defaultValue: 'opened',
					readableName: 'AssemblyAI / Le Mur Simple Question',
					description: '',
					data: [
						{
							key: 'final_model',
							type: 'stringcombo',
							possibleValues: [
								'anthropic/claude-3-opus',
								'anthropic/claude-3-haiku',
								'anthropic/claude-3-5-sonnet',
								'anthropic/claude-3-7-sonnet-20250219',
								'anthropic/claude-3-5-haiku-20241022',
								'anthropic/claude-sonnet-4-20250514',
								'anthropic/claude-opus-4-20250514',
							],
							defaultValue: 'anthropic/claude-3-haiku',
							readableName: 'Final Model',
							description: 'The model to use. Costs: \n~{model_costs}~',
						},
						{
							key: 'temperature',
							type: 'float',
							defaultValue: 0.5,
							possibleValues: [0, 1],
							readableName: 'Temperature',
							description: 'The temperature of the output',
						},
						{
							key: 'max_output_size',
							type: 'int',
							defaultValue: 1000,
							readableName: 'Max Output Size',
							description: 'The maximum size of the output',
						},
						{
							key: 'context',
							type: 'string',
							defaultValue: '',
							readableName: 'Context',
							description: 'The context of the questions',
						},
						{
							key: 'question_list',
							type: 'grouparray',
							defaultValue: 'opened',
							readableName: 'Question List',
							description: '',
							data: [
								{
									key: 'one_question',
									type: 'group',
									defaultValue: 'opened',
									readableName: 'Question Definition',
									description: 'A question to ask to the AI',
									data: [
										{
											key: 'question',
											type: 'string',
											defaultValue: 'Enter the question',
											readableName: 'Question',
											description: 'The question to ask to the AI',
										},
										{
											key: 'answer_format',
											type: 'string',
											defaultValue: '',
											readableName: 'Answer Format',
											description: 'The format of the answer',
										},
										{
											key: 'answer_options',
											type: 'string',
											defaultValue: '',
											readableName: 'Answer Options',
											description: 'The options for the answer, separated by a comma',
										},
									],
								},
							],
						},
					] }
				]
			},
			prompt: {
				options: {},
				metadata: [ {
					key: 'group_prompt',
					type: 'group',
					defaultValue: 'opened',
					readableName: 'AssemblyAI / Le Mur Simple Prompt',
					description: '',
					data: [
						{
							key: 'final_model',
							type: 'stringcombo',
							possibleValues: [
								'anthropic/claude-3-opus',
								'anthropic/claude-3-haiku',
								'anthropic/claude-3-5-sonnet',
								'anthropic/claude-3-7-sonnet-20250219',
								'anthropic/claude-3-5-haiku-20241022',
								'anthropic/claude-sonnet-4-20250514',
								'anthropic/claude-opus-4-20250514',
							],
							defaultValue: 'anthropic/claude-3-haiku',
							readableName: 'Final Model',
							description: 'The model to use.  Costs: \n~{model_costs}~',
						},
						{
							key: 'temperature',
							type: 'float',
							defaultValue: 0.5,
							possibleValues: [0, 1],
							readableName: 'Temperature',
							description: 'The temperature of the output',
						},
						{
							key: 'max_output_size',
							type: 'int',
							defaultValue: 1000,
							readableName: 'Max Output Size',
							description: 'The maximum size of the output',
						},
						{
							key: 'prompt',
							type: 'stringmultiline',
							height: 300,
							defaultValue: '',
							readableName: 'Prompt',
							description: 'The prompt to ask to the AI',
						},
					] }
				]
			},
		};
	}
	async connect( options )
	{
		super.connect( options );
		this.apiKey = options.apiKey || '';
		this.headers = {
			authorization: this.apiKey,
		};
		this.promptsPath = options.promptsPath == 'root' ? this.awi.awi.aispeech.promptsPath : options.promptsPath;

		// Poke costs
		var costText = '\n';
		for ( var model in this.costs.input )
			costText += model + ': ' + this.costs.input[model] + '/1K tokens (input), ' + this.costs.output[model] + '/1K tokens (output)\n';
		this.pokeCosts( this.defaultOptions.transcription.metadata, this.costs.transcription );
		this.pokeCosts( this.defaultOptions.summarization.metadata, { model_costs: costText } );
		this.pokeCosts( this.defaultOptions.question.metadata, { model_costs: costText } );
		this.pokeCosts( this.defaultOptions.prompt.metadata, { model_costs: costText } );

		// Get options
		this.defaultOptions.transcription.options = this.awi.properties.parseMetadata( this.defaultOptions.transcription.metadata );
		this.defaultOptions.summarization.options = this.awi.properties.parseMetadata( this.defaultOptions.summarization.metadata );
		this.defaultOptions.question.options = this.awi.properties.parseMetadata( this.defaultOptions.question.metadata );
		this.defaultOptions.prompt.options = this.awi.properties.parseMetadata( this.defaultOptions.prompt.metadata );
		return this.setConnected( true );
	}
	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[ this.token ].commands.command_speechToText = this.command_transcribe.bind(this);
		info[ this.token ].commands.command_uploadSound = this.command_uploadSound.bind(this);
		info[ this.token ].commands.command_computeDefaultOptions = this.command_computeDefaultOptions.bind(this);
		info[ this.token ].commands.command_summarize = this.command_summarize.bind(this);
		info[ this.token ].commands.command_question = this.command_question.bind(this);
		info[ this.token ].commands.command_prompt = this.command_prompt.bind(this);
		info[ this.token ].commands.command_listTranscripts = this.command_listTranscripts.bind(this);
		info[ this.token ].commands.command_deleteTranscript = this.command_deleteTranscript.bind(this);
		return this.newAnswer( info );
	}
	async setUser( args, basket, control )
	{
		return super.setUser( args, basket, control );
	}
	async getConfig( type = 'transcription', options )
	{
		return {
			...this.defaultOptions[type].options,
			...options
		};
	}
	calculateTranscriptionCost( parameters, duration )
	{
		duration /= 60 * 60;
		var costModel = ( this.costs.transcription[parameters.speech_model] || 0 ) * duration;
		var costAutoChapters = parameters.auto_chapters ? ( this.costs.transcription.auto_chapters || 0 ) * duration : 0;
		var costKeyPhrases = parameters.key_phrases ? ( this.costs.transcription.key_phrases || 0 ) * duration : 0;
		var costEntityDetection = parameters.entity_detection ? ( this.costs.transcription.entity_detection || 0 ) * duration : 0;
		var costSummarization = parameters.summarization ? ( this.costs.transcription.summarization || 0 ) * duration : 0;
		var costContentModeration = parameters.content_moderation ? ( this.costs.transcription.content_moderation || 0 ) * duration : 0;
		var costPIIRedaction = parameters.pii_redaction ? ( this.costs.transcription.pii_redaction || 0 ) * duration : 0;
		var costPIIAudioRedaction = parameters.pii_audio_redaction ? ( this.costs.transcription.pii_audio_redaction || 0 ) * duration : 0;
		var costSentimentAnalysis = parameters.sentiment_analysis ? ( this.costs.transcription.sentiment_analysis || 0 ) * duration : 0;
		var costTopicDetection = parameters.topic_detection ? ( this.costs.transcription.topic_detection || 0 ) * duration : 0;
		return costModel + costAutoChapters + costKeyPhrases + costEntityDetection + costSummarization + costContentModeration + costPIIRedaction + costPIIAudioRedaction + costSentimentAnalysis + costTopicDetection;
	}
	calculateLeMurCost( parameters, usage )
	{
		var costInput = this.costs.input[parameters.final_model] || 0;
		var costOutput = this.costs.output[parameters.final_model] || 0;
		var inputTokens = usage.input_tokens / 1000 || 0;
		var outputTokens = usage.output_tokens / 1000 || 0;
		return costInput * inputTokens + costOutput * outputTokens;
	}
	async createClient()
	{
		if ( !this.client )
		{
			try
			{
				this.client = new AssemblyAI( { apiKey: this.apiKey } );
			}
			catch ( error )
			{ 
				return this.newError({ message: 'awi:assemblyai-configuration-not-found', data: error }, { functionName: 'createClient' });
			}
		}
		return this.newAnswer( this.client );
	}
	async getPromptsList(parameters)
	{
		var promptsPath = this.promptsPath;
		var answer = await this.awi.system.exists( promptsPath );
		if ( answer.isError() )
			return answer;
		var filter = '*.' + parameters.type;
		answer = await this.awi.files.getDirectory( promptsPath, { recursive: false, listFiles: true, listDirectories: false, filters: filter, noStats: true } );
		if ( answer.isError() )
			return answer;
		var files = answer.data;
		var prompts = [];
		for ( var f = 0; f < files.length; f++ )
		{
			var file = files[ f ];
			var name = file.name.substring( 0, file.name.lastIndexOf( '.' ) );
			prompts.push( name );
		}
		return this.newAnswer( prompts );
	}
	async loadPrompt(parameters)
	{
		var answer = await this.awi.files.loadText( this.promptsPath + '/' + parameters.name + '.' + parameters.type );
		if ( answer.isError() )
			return answer;
		return this.newAnswer( answer.data );
	}
	async savePrompt(parameters)
	{
		var answer = await this.awi.files.saveText( this.promptsPath + '/' + parameters.name + '.' + parameters.type, parameters.text );
		if ( answer.isError() )
			return answer;
		return this.newAnswer( answer.data );
	}
	async deletePrompt(parameters)
	{
		return await this.awi.files.deleteFile( this.promptsPath + '/' + parameters.name + '.' + parameters.type );
	}
	async renamePrompt(parameters)
	{
		return await this.awi.files.renameFile( this.promptsPath + '/' + parameters.oldName + '.' + parameters.type, this.promptsPath + '/' + parameters.newName + '.' + parameters.type );
	}
	pokeCosts( metadata, variables )
	{
		for ( var m = 0; m < metadata.length; m++ )
		{
			var meta = metadata[m];
			if ( meta.type == 'group' || meta.type == 'grouparray' )
				this.pokeCosts( meta.data, variables );
			else if ( meta.description )
				meta.description = this.awi.messages.format(meta.description, variables);
		}
	}
	getTranscript( parameters, data )
	{
		if ( parameters.speakers && parameters.utterances && parameters.utterances.length )
		{
			var text = '';
			if ( parameters.utterances.length )
			{
				parameters.utterances.forEach((u)=>{
					if ( parameters.speakers[ u.speaker ] )
						text += '- ' + parameters.speakers[ u.speaker ].name + ': ';
					else
						text += '- Speaker ' + u.speaker + ': ';
					text += u.text + '\n';
				});
			}
			data.input_text = text;
			return data;
		}
		if ( parameters.transcript_ids )
		{
			data.transcript_ids = typeof parameters.transcript_ids == 'string' ? [parameters.transcript_ids] : parameters.transcript_ids;
			return data;
		}
		return null;
	}
	dumpError(error, data)
	{
		/*
		var self = this;
		function log(obj, path)
		{
			if (self.awi.utilities.isObject(obj))
			{
				for ( var p in obj )
					log(obj[p], path + ( path ? '.' : '' ) + p);
			}
			else if (self.awi.utilities.isArray(obj))
			{
				for ( var i = 0; i < Math.min(obj.length, 5); i++ )
					log(obj[i], path + '[' + i + ']');
			}
			else
				console.log(path + ': ' + obj.toString().substring( 0, 60 ));
		}
		if (error.response.data.error)
			console.log('ASSEMBLYAI ERROR: ' + error.response.data.error);
		else if (error.response.statusText)
			console.log('ASSEMBLYAI ERROR: ' + error.response.statusText);
		else
			console.log('ASSEMBLYAI ERROR');
		if (data)
			log(data, '');
		*/
	}
	///////////////////////////////////////////////////////////////////////////
	async getDefaultOptions(type, options)
	{
		return {
			options: { ...this.defaultOptions[type].options, ...options },
			metadata: this.defaultOptions[type].metadata,
		};
	}
	async command_computeDefaultOptions(parameters, message, editor)
	{
		var defaultOptions = this.defaultOptions;
		if ( parameters.type && this.defaultOptions[parameters.type] )
			defaultOptions = this.defaultOptions[parameters.type];

		var newOptions = {};
		for ( var d in defaultOptions )
		{
			if ( d != 'prompt' && d != 'question' )
				newOptions[ d ] = defaultOptions[ d ];
		}
		var promptBase = defaultOptions[ 'prompt' ];
		var questionBase = defaultOptions[ 'question' ];

		// Compute prompts
		if (promptBase)
		{
			var promptList = await this.getPromptsList( { type: 'prompt' } );
			if ( promptList.isError() )
				return this.replyError(promptList, message, editor);
			for ( var p = 0; p < promptList.data.length; p++ )
			{
				var promptName = promptList.data[ p ];
				var promptText = await this.loadPrompt({ name: promptName, type: 'prompt' });
				if ( promptText.isError() )
					return this.replyError(promptText, message, editor);

				var newPrompt = this.awi.utilities.copyObject( promptBase );
				newPrompt.options.prompt = promptText.data;
				newOptions[ 'prompt-' + promptName ] = newPrompt;
			}
		}

		// Compute questions
		if (questionBase)
		{
			var questionList = await this.getPromptsList( { type: 'question' } );
			if ( questionList.isError() )
				return this.replyError(questionList, message, editor);
			if ( questionList.data.length )
			{
				for ( var questionIndex = 0; questionIndex < questionList.data.length; questionIndex++ )
				{
					var questionName = questionList.data[ questionIndex ];
					var questionText = await this.loadPrompt({ name: questionName, type: 'question' });
					if ( questionText.isError() )
						return this.replyError(questionText, message, editor);
					questionText = this.awi.utilities.replaceStringInText(questionText.data, '\r', '');
					var questionLines = questionText.split('\n');

					var newQuestion = this.awi.utilities.copyObject(questionBase);
					newQuestion.options.question_list = [];
					var l = 0;
					while(true)
					{
						var q = {};
						for ( ; l < questionLines.length; l++ )
						{
							var line = questionLines[ l ];
							if ( line.startsWith( 'question:' ) )
							{
								if ( q.question ) break;
								q.question = line.replace( 'question:', '' ).trim();
							}
							else if ( line.startsWith( 'answer_options:' ) ) {
								var arr = line.replace( 'answer_options:', '' ).trim().split(',');
								var newArr = [];
								for ( var i = 0; i < arr.length; i++ )
								{
									var txt = arr[i].trim();
									if ( txt )
										newArr.push(txt);
								}
								q.answer_options = newArr;
							}
							else if ( line.startsWith( 'answer_format:' ) )
								q.answer_format = line.replace( 'answer_format:', '' ).trim();
						}
						if ( !q.question )
							break;
						newQuestion.options.question_list.push(q);
					}
					newOptions[ 'question-' + questionName ] = newQuestion;
				}
			}
		}
		return this.replySuccess( this.newAnswer( newOptions ), message, editor );
	}
	async command_uploadSound(parameters, message, editor)
	{
		if (!this.apiKey)
			return this.replyError(
				this.newError(
					{ message: 'awi:assemblyai-missing-key', data: 'Missing AssemblyAI apiKey' },
					{ functionName: 'command_uploadSound' },
					{ payload: { hasSoundPath: !!parameters?.soundPath, hasAudioBase64: !!parameters?.audioBase64 } }
				),
				message,
				editor
			);

		var audioData = null;
		if ( parameters.soundPath )
		{
			audioData = await this.awi.system.readFile(parameters.soundPath);
			if ( audioData.isError() )
				return this.replyError(audioData, message, editor);
			audioData = audioData.data;
		}
		else if ( parameters.audioBase64 )
		{
			audioData = this.awi.utilities.convertStringToArrayBuffer(parameters.audioBase64);
		}
		if (!audioData)
			return this.replyError(this.newError({ message: 'awi:no-file-attached' }, { functionName: 'command_uploadSound' }), message, editor);
		const url = `${this.baseUrl}/v2/upload`;
		try
		{
			const uploadResponse = await axios.post(url, audioData, { headers: this.headers });
			const audioUrl = uploadResponse.data.upload_url;
			return this.replySuccess( this.newAnswer( audioUrl ), message, editor );
		}
		catch (err)
		{
			const errMsg = err?.response?.data?.error || err?.message || err;
			return this.replyError(
				this.newError(
					{ message: 'awi:assemblyai-upload-error', data: errMsg },
					{ functionName: 'command_uploadSound' },
					{
						payload: { url, hasSoundPath: !!parameters?.soundPath, hasAudioBase64: !!parameters?.audioBase64 },
						status: err?.response?.status,
						responseData: err?.response?.data,
						responseHeaders: err?.response?.headers,
					}
				),
				message,
				editor
			);
		}
	}
	async command_transcribe(parameters, message, editor)
	{
		if (!this.apiKey)
			return this.replyError(
				this.newError(
					{ message: 'awi:assemblyai-missing-key', data: 'Missing AssemblyAI apiKey' },
					{ functionName: 'command_transcribe' },
					{ payload: { hasAudioUrl: !!parameters?.audioUrl } }
				),
				message,
				editor
			);
		if (!parameters || !parameters.audioUrl)
			return this.replyError(
				this.newError(
					{ message: 'awi:missing-argument', data: 'audioUrl' },
					{ functionName: 'command_transcribe' },
					{ payload: { audioUrl: parameters?.audioUrl || null } }
				),
				message,
				editor
			);

		// Transcribe
		var data = await this.getConfig( 'transcription', parameters.options );
		data.audio_url = parameters.audioUrl;
		try {
			if ( data.language_code == 'none' )
				delete data.language_code;
			else
			{
				delete data.language_detection;
				delete data.language_detection_threshold;
			}
			if ( !data.summarization )
			{
				delete data.summarization;
				delete data.summary_model;
				delete data.summary_type;
			}
			if (!data.disfluencies) delete data.disfluencies;
			if (!data.speaker_labels) delete data.speaker_labels;
			if (!data.punctuate) delete data.punctuate;
			if (!data.format_text) delete data.format_text;
			if (!data.sentiment_analysis) delete data.sentiment_analysis;
			if (!data.filter_profanity) delete data.filter_profanity;
			if (!data.auto_chapters) delete data.auto_chapters;
			if (!data.auto_hilights) delete data.auto_hilights;
		} catch(e){}
		const url = `${this.baseUrl}/v2/transcript`;
		try {
			const response = await axios.post(url, data, { headers: this.headers });
			const transcriptId = response.data.id;
			const pollingEndpoint = `${this.baseUrl}/v2/transcript/${transcriptId}`;
			while (true) {
				const pollingResponse = await axios.get(pollingEndpoint, {
					headers: this.headers,
				});
				const transcriptionResult = pollingResponse.data;
				if (transcriptionResult.status === "completed") {
					transcriptionResult.cost = this.calculateTranscriptionCost(data, parameters.duration);
					return this.replySuccess( this.newAnswer( transcriptionResult ), message, editor );
				} else if (transcriptionResult.status === "error") {
					return this.replyError(
						this.newError(
							{ message: 'awi:transcription-error', data: transcriptionResult.error || transcriptionResult },
							{ functionName: 'command_transcribe' },
							{
								payload: { url, audioUrl: parameters.audioUrl, options: parameters.options },
								status: pollingResponse?.status,
								responseData: transcriptionResult,
								responseHeaders: pollingResponse?.headers,
							}
						),
						message,
						editor
					);
				} else {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}
		} catch (error) {
			this.dumpError(error, data);
			const errMsg = error?.response?.data?.error || error?.message || error;
			return this.replyError(
				this.newError(
					{ message: 'awi:transcription-error', data: errMsg },
					{ functionName: 'command_transcribe' },
					{
						payload: { url, audioUrl: parameters.audioUrl, options: parameters.options },
						status: error?.response?.status,
						responseData: error?.response?.data,
						responseHeaders: error?.response?.headers,
					}
				),
				message,
				editor
			);
		}
	}

	async command_summarize(parameters, message, editor)
	{
		const url = 'https://api.assemblyai.com/lemur/v3/generate/summary';
		try {
			var data = await this.getConfig('summarization', parameters.options);
			if ( !data.answer_format )
				delete data.answer_format;
			if ( !data.context )
				delete data.context;
			data = this.getTranscript(parameters, data);
			if (!data)
				return this.replyError(this.newError({ message: 'awi:no-transcripted-text-error' }, { functionName: 'command_summarize' }), message, editor);

			const response = await axios.post(url, data, { headers: this.headers });
			response.data.id = this.awi.utilities.getUniqueIdentifier( {}, 'lemur', 'YYYYMMDD_hhmmss' );
			response.data.cost = this.calculateLeMurCost(data, response.data.usage);
			return this.replySuccess(this.newAnswer(response.data), message, editor);
		} catch (error) {
			this.dumpError(error, data);
			const errMsg = error?.response?.data?.error || error?.response?.data || error?.message || error;
			return this.replyError(
				this.newError(
					{ message: 'awi:summarize-error', data: errMsg },
					{ functionName: 'command_summarize' },
					{
						payload: { url, request: data },
						status: error?.response?.status,
						responseData: error?.response?.data,
						responseHeaders: error?.response?.headers,
					}
				),
				message,
				editor
			);
		}
	}
	async command_question(parameters, message, editor)
	{
		const url = 'https://api.assemblyai.com/lemur/v3/generate/question-answer';
		try {
			var questions = [];
			var questionList = parameters.options.question_list;
			for ( var q = 0; q < questionList.length; q++ )
			{
				var question = questionList[ q ];
				var toPush = { question: question.question };
				if ( question.answer_format && question.answer_format.length > 0 )
					toPush.answer_format = question.answer_format;
				if ( question.answer_options && question.answer_options.length > 0 )
					toPush.answer_options = question.answer_options;
				questions.push(toPush);
			}
			/*
			var transcriptIds = typeof parameters.transcript_ids == 'string' ? [parameters.transcript_ids] : parameters.transcript_ids;
			var data = {
				final_model: parameters.options.final_model,
				transcript_ids: transcriptIds,
				questions: questions,
				temperature: parameters.options.temperature,
				max_output_size: parameters.options.max_output_size,
				context: parameters.options.context,
			};
			*/
			var data = await this.getConfig('question', parameters.options);
			data.questions = questions;
			delete data.question_list;
			if ( !data.context )
				delete data.context;
			data = this.getTranscript(parameters, data);
			if (!data)
				return this.replyError(this.newError({ message: 'awi:no-transcripted-text-error' }, { functionName: 'command_question' }), message, editor);

			const response = await axios.post(url, data, { headers: this.headers });
			response.data.id = this.awi.utilities.getUniqueIdentifier( {}, 'lemur', 'YYYYMMDD_hhmmss' );
			response.data.cost = this.calculateLeMurCost(data, response.data.usage);
			return this.replySuccess(this.newAnswer(response.data), message, editor);
		} catch (error) {
			this.dumpError(error, data);
			return this.replyError(this.newError({ message: 'awi:question-error', data: error.response.data.error }, { functionName: 'command_question' }), message, editor);
		}
	}
	async command_prompt(parameters, message, editor)
	{
		const url = 'https://api.assemblyai.com/lemur/v3/generate/task';
		try {
			var data = await this.getConfig('prompt', parameters.options);
			if ( !data.answer_format )
				delete data.answer_format;
			data = this.getTranscript(parameters, data);
			if (!data)
				return this.replyError(this.newError({ message: 'awi:no-transcripted-text-error' }, { functionName: 'command_prompt' }), message, editor);
			data.prompt = parameters.prompt;
			
			const response = await axios.post(url, data, { headers: this.headers });
			response.data.id = this.awi.utilities.getUniqueIdentifier( {}, 'lemur', 'YYYYMMDD_hhmmss' );
			response.data.cost = this.calculateLeMurCost(data, response.data.usage);
			return this.replySuccess(this.newAnswer(response.data), message, editor);
		} catch (error) {
			this.dumpError(error, data);
			const errMsg = error?.response?.data?.error || error?.response?.data || error?.message || error;
			return this.replyError(
				this.newError(
					{ message: 'awi:prompt-error', data: errMsg },
					{ functionName: 'command_prompt' },
					{
						payload: { url, request: data },
						status: error?.response?.status,
						responseData: error?.response?.data,
						responseHeaders: error?.response?.headers,
					}
				),
				message,
				editor
			);
		}
	}
	async command_listTranscripts(parameters, message, editor)
	{
		var url;
		if (parameters.europe)
			url = 'https://api.eu.assemblyai.com/v2/transcript';
		else
			url = 'https://api.assemblyai.com/v2/transcript';
		try {
			const response = await axios.get(url, { headers: this.headers });
			return this.replySuccess(this.newAnswer(response.data), message, editor);
		} catch (error) {
			this.dumpError(error, parameters);
			return this.replyError(this.newError({ message: 'awi:list-transcripts-error', data: error.response.statusText }, { functionName: 'command_listTranscripts' }), message, editor);
		}
	}
	async command_deleteTranscript(parameters, message, editor)
	{
		var url;
		if (parameters.europe)
			url = 'https://api.eu.assemblyai.com/v2/transcript'
		else
			url = 'https://api.assemblyai.com/v2/transcript';
		url += '/' + parameters.transcript_id;
		try {
			const response = await axios.delete(url, { headers: this.headers });
			return this.replySuccess(this.newAnswer(response.data), message, editor);
		} catch (error) {
			this.dumpError(error, parameters);
			return this.replyError(this.newError({ message: 'awi:delete-transcript-error', data: error.response.statusText }, { functionName: 'command_deleteTranscript' }), message, editor);
		}
	}
}
