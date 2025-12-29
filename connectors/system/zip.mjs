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
* @file zip.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Zip functions
*/
import ConnectorBase from '../../connector.mjs'
import * as fflate from 'fflate'
import { Buffer } from 'node:buffer'

export { ConnectorZip as Connector }

class ConnectorZip extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Zip';
		this.token = 'zip';
		this.className = 'ConnectorZip';
		this.group = 'system';
		this.version = '0.5';
	}
	async connect( options )
	{
		super.connect( options, true );
		return this.setConnected( true );
	}
	async unzipBase64ToFile( base64, path )
	{
		// Convert to Uint8Array
		var uint8Array = Buffer.from(base64, 'base64');
		// Unzip
		var unzip = fflate.unzipSync(uint8Array);
		// Write file
		return this.awi.system.writeFile(path, unzip);
	}
	async zipFile( path, zipPath, options )
	{
		return this.newAnswer( path );
	}
	/**Query params
     * Zips a directory
     * @param {string} path - Path to the directory to zip
     * @param {string} zipPath - Path where to save the zip file
     * @param {Object} [options] - Options for zipping
     * @param {boolean} [options.recursive=true] - Whether to include subdirectories
     * @param {number} [options.compression=6] - Compression level (0-9)
     * @param {string[]} [options.excludes] - Array of file patterns to exclude
     * @param {string[]} [options.filters] - Array of file patterns to include
     * @returns {Promise<Answer>} - Result of the operation
     */
	async zipDirectory(path, zipPath, options = {})
	{
		try
		{
			// Set default options
			const opts = {
				recursive: true,
				compression: 6,
				excludes: [],
				...options
			};

			// Get directory contents
			const dirAnswer = await this.awi.files.getDirectory(path, {
				recursive: opts.recursive,
				listFiles: true,
				listDirectories: false,
				noStats: true,
				filters: opts.filters,
				excludes: opts.excludes
			});

			if (dirAnswer.isError())
			{
				return dirAnswer;
			}

			const files = dirAnswer.getValue();
			const zip = {};
			const basePath = this.awi.system.normalize(path);

			// Process each file
			for (const file of files)
			{
				// Skip directories (shouldn't happen with listDirectories: false)
				if (file.isDirectory)
				{
					continue;
				}

				// Read file content
				const contentAnswer = await this.awi.system.readFile(file.path);
				if (contentAnswer.isError())
				{
					return contentAnswer;
				}

				// Add to zip with relative path
				const relativePath = this.awi.system.relative(basePath, file.path);
				zip[relativePath] = [
					new Uint8Array(contentAnswer.data),
					{ level: Math.min(9, Math.max(0, opts.compression)) }
				];
			}

			// Create zip file
			const zipped = fflate.zipSync(zip);

			// Write zip file
			if (zipPath)
			{
				const writeAnswer = await this.awi.system.writeFile(zipPath, Buffer.from(zipped.buffer));
				if (writeAnswer.isError())
				{
					return writeAnswer;
				}
				return this.newAnswer({
					path: zipPath,
					fileCount: Object.keys(zip).length,
					size: zipped.length
				});
			}
			var base64 = this.awi.utilities.convertArrayBufferToString( zipped.buffer );
			return this.newAnswer({
				zipBase64: base64,
				fileCount: Object.keys(zip).length,
				size: zipped.length
			});
		}
		catch (error)
		{
			return this.newError({ message: 'awi:zip-error', data: error }, { functionName: 'zipDirectory' });
		}
	}
}
