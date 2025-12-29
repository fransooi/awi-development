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
* @file base.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Root class of Connectors, Bubbles, Branches, Memories and Souvenirs.
*
*/
import Answer from './answer.mjs'
export default class Base
{
	constructor( awi, config, data )
	{
		this.awi = awi;
		this.config = config;
		this.version = '***UNDEFINED***';
		this.className = '***UNDEFINED***';
		this.group = '***UNDEFINED***';
		this.debug = true;
	}
	newAnswer( data, logData, extraData )
	{
		var answer = new Answer( this, data, logData?.message || 'awi:~{value}~', logData?.type );
		if ( this.debug && extraData )
			answer.extraData = this.sanitizeForJson( extraData );
		if (logData)
		{
			answer.awi.log( answer.getPrint(), {
				source: 'awi',
				level: 'success',
				connector: this.token,
				group: this.group,
				className: this.className,
				name: this.name,
				version: this.version,
				...logData
			} );
		}
		return answer;
	}
	newWarning( definition, logData = {} )
	{
		var { message, data, type, functionName } = definition;
		var answer = new Answer( this, data, message, type );
		answer.setWarning( message );
		answer.awi.log( answer.getPrint(), {
			source: 'awi',
			level: 'warning',
			className: this.className,
			version: this.version,
			functionName: functionName,
			...logData
		} );
		return answer;
	}
	newError( definition, logData = {}, extraData )
	{
		var { message, data, type, functionName } = definition;
		var answer = new Answer( this, data, message, type );
		answer.setError( message );
		var errorData = {
			source: 'awi',
			level: 'error',
			className: this.className,
			version: this.version,
			functionName: functionName,
			...logData
		};
		// Merge extra data if provided (e.g. payload from API calls)
		if (extraData)
			errorData = { ...errorData, ...extraData };
		answer.awi.log( answer.getPrint(), errorData );
		if (this.debug)
		{
			answer.extraData = this.sanitizeForJson(errorData);
			console.log('ERROR!', answer.extraData );
		}
		return answer;
	}

	// Remove circular references and non-serializable objects for JSON
	sanitizeForJson(obj, seen = new WeakSet())
	{
		if (obj === null || typeof obj !== 'object') return obj;
		if (seen.has(obj)) return '[Circular]';
		seen.add(obj);

		if (Array.isArray(obj))
			return obj.map(item => this.sanitizeForJson(item, seen));

		const clean = {};
		for (const key of Object.keys(obj))
		{
			const val = obj[key];
			// Skip known problematic objects
			if (key === 'awi' || key === 'parent' || key === 'root' || key === 'connector')
				continue;
			// Skip functions
			if (typeof val === 'function')
				continue;
			clean[key] = this.sanitizeForJson(val, seen);
		}
		return clean;
	}
}

