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
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file convertors.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Media converter connector for audio/video processing using FFmpeg
*
*/
import ConnectorBase from '../../connector.mjs'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
export { ConnectorConvertors as Connector }

class ConnectorConvertors extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Convertors';
		this.token = 'convertors';
		this.className = 'ConnectorConvertors';
		this.group = 'awi';
		this.version = '0.5';
	}

	async connect( options )
	{
		super.connect( options );
		
		// Test if FFmpeg is available
		try
		{
			await new Promise((resolve, reject) => {
				ffmpeg.getAvailableFormats((err, formats) => {
					if (err)
					{
						this.connectMessage = ' (warning: FFmpeg may not be installed)';
						resolve();
					}
					else
					{
						this.connectMessage = ' (FFmpeg available)';
						resolve();
					}
				});
			});
		}
		catch (error)
		{
			this.connectMessage = ' (warning: FFmpeg check failed)';
		}

		return this.setConnected( true );
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
		data[this.token].commands.extractAudioFromVideo = this.command_extractAudioFromVideo.bind(this);
		data[this.token].commands.getMediaDuration = this.command_getMediaDuration.bind(this);
		data[this.token].commands.getMediaInfo = this.command_getMediaInfo.bind(this);
		data[this.token].commands.convertAudioFormat = this.command_convertAudioFormat.bind(this);

		return this.newAnswer( data );
	}

	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( { message: 'awi:command-not-found', data: message.command }, { functionName: 'command' } ), message, editor );
	}

	/**
	 * Command: Extract audio from video file
	 */
	async command_extractAudioFromVideo( parameters, message, editor )
	{
		try
		{
			const { videoPath, audioPath, format, quality } = parameters;

			if (!videoPath)
				return this.replyError(this.newError({ message: 'awi:missing-video-path', data: videoPath }, { functionName: 'command_extractAudioFromVideo' }), message, editor);

			if (!audioPath)
				return this.replyError(this.newError({ message: 'awi:missing-audio-path', data: audioPath }, { functionName: 'command_extractAudioFromVideo' }), message, editor);

			const result = await this.extractAudioFromVideo(
				videoPath,
				audioPath,
				format || 'mp3',
				quality || 2
			);

			return this.replySuccess(this.newAnswer(result), message, editor);
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'awi:audio-extraction-error', data: error }, { functionName: 'command_extractAudioFromVideo' }), message, editor);
		}
	}

	/**
	 * Command: Get media duration
	 */
	async command_getMediaDuration( parameters, message, editor )
	{
		try
		{
			const { filePath } = parameters;

			if (!filePath)
				return this.replyError(this.newError({ message: 'awi:missing-file-path', data: filePath }, { functionName: 'command_getMediaDuration' }), message, editor);

			const duration = await this.getMediaDuration(filePath);

			return this.replySuccess(this.newAnswer({ duration }), message, editor);
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'awi:duration-error', data: error }, { functionName: 'command_getMediaDuration' }), message, editor);
		}
	}

	/**
	 * Command: Get complete media info
	 */
	async command_getMediaInfo( parameters, message, editor )
	{
		try
		{
			const { filePath } = parameters;

			if (!filePath)
				return this.replyError(this.newError({ message: 'awi:missing-file-path', data: filePath }, { functionName: 'command_getMediaInfo' }), message, editor);

			const info = await this.getMediaInfo(filePath);

			return this.replySuccess(this.newAnswer(info), message, editor);
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'awi:media-info-error', data: error }, { functionName: 'command_getMediaInfo' } ), message, editor);
		}
	}

	/**
	 * Command: Convert audio format
	 */
	async command_convertAudioFormat( parameters, message, editor )
	{
		try
		{
			const { inputPath, outputPath, format, bitrate, sampleRate } = parameters;

			if (!inputPath)
				return this.replyError(this.newError({ message: 'awi:missing-input-path', data: inputPath }, { functionName: 'command_convertAudioFormat' }), message, editor);

			if (!outputPath)
				return this.replyError(this.newError({ message: 'awi:missing-output-path', data: outputPath }, { functionName: 'command_convertAudioFormat' }), message, editor);

			const result = await this.convertAudioFormat(
				inputPath,
				outputPath,
				format || 'mp3',
				bitrate,
				sampleRate
			);

			return this.replySuccess(this.newAnswer(result), message, editor);
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'awi:audio-conversion-error', data: error }, { functionName: 'command_convertAudioFormat' }), message, editor);
		}
	}

	// ============================================================================
	// Core Methods - Can be called directly by other connectors
	// ============================================================================

	/**
	 * Extract audio from video file using FFmpeg
	 * @param {string} videoPath - Path to input video file
	 * @param {string} audioPath - Path to output audio file
	 * @param {string} format - Output audio format (default: 'mp3')
	 * @param {number} quality - Audio quality 0-9, lower is better (default: 2)
	 * @returns {Promise<object>} - Object with audioPath and duration
	 */
	extractAudioFromVideo(videoPath, audioPath, format = 'mp3', quality = 2)
	{
		return new Promise((resolve, reject) => {
			const command = ffmpeg(videoPath)
				.noVideo()
				.toFormat(format);

			// Set codec based on format
			if (format === 'mp3')
			{
				command.audioCodec('libmp3lame').audioQuality(quality);
			}
			else if (format === 'aac' || format === 'm4a')
			{
				command.audioCodec('aac');
			}
			else if (format === 'ogg')
			{
				command.audioCodec('libvorbis');
			}

			command
				.on('end', async () => {
					console.log('[Convertors] Audio extraction completed:', audioPath);
					try
					{
						const duration = await this.getMediaDuration(audioPath);
						resolve({ audioPath, duration });
					}
					catch (err)
					{
						resolve({ audioPath, duration: 0 });
					}
				})
				.on('error', (err) => {
					console.error('[Convertors] Error extracting audio:', err);
					reject(err);
				})
				.save(audioPath);
		});
	}

	/**
	 * Get duration of media file using FFmpeg
	 * @param {string} filePath - Path to media file
	 * @returns {Promise<number>} - Duration in seconds
	 */
	getMediaDuration(filePath)
	{
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(filePath, (err, metadata) => {
				if (err)
				{
					console.error('[Convertors] Error getting media duration:', err);
					return reject(err);
				}
				const duration = metadata.format.duration || 0;
				console.log('[Convertors] Media duration:', duration, 'seconds');
				resolve(duration);
			});
		});
	}

	/**
	 * Get complete media information using FFmpeg
	 * @param {string} filePath - Path to media file
	 * @returns {Promise<object>} - Complete media metadata
	 */
	getMediaInfo(filePath)
	{
		return new Promise((resolve, reject) => {
			ffmpeg.ffprobe(filePath, (err, metadata) => {
				if (err)
				{
					console.error('[Convertors] Error getting media info:', err);
					return reject(err);
				}

				const format = metadata.format || {};
				const streams = metadata.streams || [];
				
				const videoStream = streams.find(s => s.codec_type === 'video');
				const audioStream = streams.find(s => s.codec_type === 'audio');

				const info = {
					duration: format.duration || 0,
					size: format.size || 0,
					bitrate: format.bit_rate || 0,
					format: format.format_name || 'unknown',
					hasVideo: !!videoStream,
					hasAudio: !!audioStream,
					video: videoStream ? {
						codec: videoStream.codec_name,
						width: videoStream.width,
						height: videoStream.height,
						frameRate: videoStream.r_frame_rate,
						bitrate: videoStream.bit_rate
					} : null,
					audio: audioStream ? {
						codec: audioStream.codec_name,
						channels: audioStream.channels,
						sampleRate: audioStream.sample_rate,
						bitrate: audioStream.bit_rate
					} : null
				};

				console.log('[Convertors] Media info:', info);
				resolve(info);
			});
		});
	}

	/**
	 * Convert audio file to different format
	 * @param {string} inputPath - Path to input audio file
	 * @param {string} outputPath - Path to output audio file
	 * @param {string} format - Output format (mp3, aac, ogg, wav, etc.)
	 * @param {number} bitrate - Output bitrate in kbps (optional)
	 * @param {number} sampleRate - Output sample rate in Hz (optional)
	 * @returns {Promise<object>} - Object with outputPath and info
	 */
	convertAudioFormat(inputPath, outputPath, format = 'mp3', bitrate = null, sampleRate = null)
	{
		return new Promise((resolve, reject) => {
			const command = ffmpeg(inputPath)
				.toFormat(format);

			// Set codec based on format
			if (format === 'mp3')
			{
				command.audioCodec('libmp3lame');
			}
			else if (format === 'aac' || format === 'm4a')
			{
				command.audioCodec('aac');
			}
			else if (format === 'ogg')
			{
				command.audioCodec('libvorbis');
			}
			else if (format === 'wav')
			{
				command.audioCodec('pcm_s16le');
			}

			// Set bitrate if specified
			if (bitrate)
			{
				command.audioBitrate(bitrate);
			}

			// Set sample rate if specified
			if (sampleRate)
			{
				command.audioFrequency(sampleRate);
			}

			command
				.on('end', async () => {
					console.log('[Convertors] Audio conversion completed:', outputPath);
					try
					{
						const info = await this.getMediaInfo(outputPath);
						resolve({ outputPath, info });
					}
					catch (err)
					{
						resolve({ outputPath, info: null });
					}
				})
				.on('error', (err) => {
					console.error('[Convertors] Error converting audio:', err);
					reject(err);
				})
				.save(outputPath);
		});
	}

	/**
	 * Cleanup temporary file
	 * @param {string} filePath - Path to file to cleanup
	 */
	cleanupTempFile(filePath)
	{
		try
		{
			if (filePath && fs.existsSync(filePath))
			{
				fs.unlinkSync(filePath);
				console.log('[Convertors] Cleaned up temp file:', filePath);
			}
		}
		catch (error)
		{
			console.error('[Convertors] Error cleaning up temp file:', error);
		}
	}

	/**
	 * Ensure temp directory exists
	 * @param {string} tempDir - Path to temp directory
	 * @returns {string} - Path to temp directory
	 */
	ensureTempDir(tempDir)
	{
		try
		{
			if (!fs.existsSync(tempDir))
			{
				fs.mkdirSync(tempDir, { recursive: true });
				console.log('[Convertors] Created temp directory:', tempDir);
			}
			return tempDir;
		}
		catch (error)
		{
			console.error('[Convertors] Error creating temp directory:', error);
			throw error;
		}
	}
}
