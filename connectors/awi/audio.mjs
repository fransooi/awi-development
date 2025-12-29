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
*
* ----------------------------------------------------------------------------
* @file audio.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Audio connector for audio processing
*
*/
import ConnectorBase from '../../connector.mjs'
import { convertAndSaveAudio } from 'light-audio-converter';
export { ConnectorAudio as Connector }

class ConnectorAudio extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.name = 'Audio';
		this.token = 'audio';
		this.className = 'ConnectorAudio';
		this.group = 'awi';
		this.version = '0.5';
	}
	async connect( options )
	{
		super.connect( options );
		return this.setConnected( true );
	}
	async convertAndSave( args, basket, control )
	{
		var { source, destination, outputFormat } = await this.awi.utilities.getArgs( [ 'source', 'destination', 'outputFormat' ], args, basket, [ '', '', 'mp3' ] );
		var response;
		try
		{
			response = await convertAndSaveAudio(source, outputFormat, destination);
		}
		catch( error )
		{
			return this.newError({ message: 'awi:audio-convert-error', data: error });
		}
		return this.newAnswer( response );
	}
}
