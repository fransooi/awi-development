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
* @file basket.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Multipurpose Stackable Values
*
*/
export default class Answer
{
	constructor( parent, data, message, type )
	{
		this.parent = parent;
		this.awi = parent.className != 'Awi' ? parent.awi : parent;
		this.error = false;
		this.warning = false;
		this.data = data;
		this.extraData = null;
		this.message = message || 'awi:~{value}~';
		this.type = type || this.getVariableType( data );
	}
	reset()
	{
		this.data = 0;
		this.type = 'int';
		this.error = false;
		this.warning = false;
		this.message = 'awi:~{value}~';
	}
	setError()
	{
		this.error = true;
	}
	setWarning()
	{
		this.warning = true;
	}
	isSuccess()
	{
		return !this.error && !this.warning;
	}
	isWarning()
	{
		return this.warning;
	}
	isError()
	{
		return this.error;
	}
	isNumber()
	{
		return this.type == 'int' || this.type == 'float' || this.type == 'number' || this.type == 'hex' || this.type == 'bin';
	}
	isString()
	{
		return this.type == 'string';
	}
	setValue( data, type )
	{
		this.data = data;
		this.type = type || this.getVariableType( data );
	}
	setMessage( message )
	{
		this.message = message;
	}
	getString( format )
	{
		switch ( this.type )
		{
			case 'boolean':
				return ( this.data ? 'true' : 'false' );
			case 'int':
				return '' + this.data;
			case 'float':
				return this.awi.messages.formatFloat( this.data, format );
			case 'number':
				return this.awi.messages.formatNumber( this.data, format );
			case 'bin':
				return '%' + this.awi.messages.formatBin( this.data, format );
			case 'hex':
				return '$' + this.awi.messages.formatHex( this.data, format );
			case 'string':
				return this.data;
			case 'undefined':
				return 'undefined';
			case 'object':
				var text = '';
				if ( this.data.code )
					text += 'Code: ' + this.data.code + ' ';
				else if ( this.data.message )
					text += 'Message: ' + this.data.message + ' ';
				else if ( this.data.details )
					text += 'Details: ' + this.data.details + ' ';
				else if ( this.data.id )
					text += 'ID: ' + this.data.id + ' ';
				if ( text )
					return text;
				try { text = JSON.stringify( this.data ).substring( 0, 80 ); }
				catch ( e ) { text= 'object'; }
				return text;
			default:
				return this.data.toString();
		}
	}
	getValue( outType )
	{
		if ( !outType || outType == this.type )
			return this.data;
		return 'TO CONVERT' + this.data;
	}
	getPrint( format )
	{
		var value = this.getString( format );
		if ( value == 'undefined' )
			value = '';
		if ( this.error )
		{
			if ( this.message.indexOf( 'awi:' ) == 0 )
				return this.awi.messages.getMessage( this.message, { value } );
			return this.message + ( value ? ': ' + value : '' );
		}
		if ( this.warning )
		{
			if ( this.message.indexOf( 'awi:' ) == 0 )
				return this.awi.messages.getMessage( this.message, { value } );
			return this.message + ( value ? ': ' + value : '' );
		}
		if ( typeof this.message == 'function' )
			return this.message( this, format );
		if ( this.message.indexOf( 'awi:' ) == 0 )
			return this.awi.messages.getMessage( this.message, { value } );
		return this.message + ( value ? ': ' + value : '' );
	}	
	getVariableType( variable )
	{
		var result = typeof variable;
		if ( result == 'undefined' || result == 'string' || result == 'function' ) 
			return result;
		else if ( result == 'object' )
		{
			if ( variable === null ) return result;
			if ( Array.isArray( variable ) ) return 'array';			
			return 'object';
		}
		else if ( variable === true || variable === false )
			return 'boolean';
		else if (!isNaN( variable ))
		{
			if ( variable % 1 == 0 )
				return 'int';
			else if ( variable % 1 != 0 )
				return 'float';
			return 'number';
		}
		return 'undefined';
	}
}

