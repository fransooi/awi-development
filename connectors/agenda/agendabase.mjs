/** --------------------------------------------------------------------------
*
*            / \
*          / _ \              (°°)       Intelligent
*        / ___ \ [ \ [ \ [  ][   ]       Programmable
*     _/ /   \ \_\ \/\ \/ /  |  | \      Personal Assistant
* (_)|____| |____|\_\_/\_\_/ [_| |_] \     link:
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
* Please support the project: https://patreon.com/francoislionet
*
* ----------------------------------------------------------------------------
* @file agendabase.js
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Agenda connector base class.
*
*/
import ConnectorBase from '../../connector.mjs'
import { format, parseISO, isValid } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export default class ConnectorAgendaBase extends ConnectorBase
{
	constructor( awi, config = {} )
	{
		super( awi, config );
		this.className = 'ConnectorAgendaBase';
		this.group = 'agenda';
		this.version = '0.5';
		this.userId = null;
		this.userName = null;
		this.token = null;
	}

	async connect( options )
	{
		super.connect( options );
	}

	async registerEditor(args, basket, control)
	{
		this.editor = args.editor;
		this.userName = args.userName;
		var data = {};
		data[ this.token ] =
		{
			self: this,
			version: this.version,
			commands: {}
		}
		return data;
	}

	async setUser(args, basket, control)
	{
		if (args.userId) {
			this.userId = args.userId;
		}
		if (args.userName) {
			this.userName = args.userName;
		}
		return this.newAnswer(true);
	}

	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError( { message: 'awi:command-not-found', data: message.command }, { functionName: 'command' } ), message, editor );
	}
	getDatabase()
	{
		if ( this.awi.database)
			return this.awi.database;
		else if ( this.awi.awi && this.awi.awi.database)
			return this.awi.awi.database;
		throw new Error('awi:database-not-found');
	}
	getAuthentification()
	{
		if ( this.awi.authentification)
			return this.awi.authentification;
		else if ( this.awi.awi && this.awi.awi.authentification)
			return this.awi.awi.authentification;
		throw new Error('awi:authentification-not-found');
	}

	////////////////////////////////////////////////////////////////////
	// Commands
	////////////////////////////////////////////////////////////////////
	async command_listMeetings(parameters, message, editor)
	{
		parameters.startDate = parameters.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		parameters.endDate = parameters.endDate || null;
		parameters.limit = parameters.limit || 100;
		const meetings = await this._fetchMeetings(parameters);
		if (meetings.isError())
			return this.replyError(meetings, message, editor);
		// Filter: keep only Google Meet events
		const list = Array.isArray(meetings.data) ? meetings.data : [];
		const filtered = list.filter(m => {
			if (!m || m.source !== 'agendagoogle') return false;
			const title = (m.title || '').trim().toLowerCase();
			if (title === 'home') return false;
			return true;
		});
		return this.replySuccess(this.newAnswer(filtered), message, editor);
	}
	async command_createMeeting(parameters, message, editor)
	{
		const result = await this._createMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}
	async command_updateMeeting(parameters, message, editor)
	{
		const result = await this._updateMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}
	async command_deleteMeeting(parameters, message, editor)
	{
		const result = await this._deleteMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}
	async command_getMeeting(parameters, message, editor)
	{
		const meeting = await this._getMeeting(parameters);
		if (meeting.isError())
			return this.replyError(meeting, message, editor);
		return this.replySuccess(meeting, message, editor);
	}
	async command_linkRecording(parameters, message, editor)
	{
		const result = await this._linkRecording(parameters.meetingId, parameters.recordingId);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}
	async _fetchMeetings(parameters)
	{
		return this.newError({ message: '_fetchMeetings not implemented in ' + this.className });
	}
	async _createMeeting(parameters)
	{
		return this.newError({ message: '_createMeeting not implemented in ' + this.className });
	}
	async _updateMeeting(parameters)
	{
		return this.newError({ message: '_updateMeeting not implemented in ' + this.className });
	}
	async _deleteMeeting(parameters)
	{
		return this.newError({ message: '_deleteMeeting not implemented in ' + this.className });
	}
	async _getMeeting(parameters)
	{
		return this.newError({ message: '_getMeeting not implemented in ' + this.className });
	}
	async _linkRecording(parameters)
	{
		return this.newError({ message: '_linkRecording not implemented in ' + this.className });
	}
	_formatDate(date)
	{
		if (!date) return null;
		try
		{
			const parsedDate = typeof date === 'string' ? parseISO(date) : date;
			if (!isValid(parsedDate)) return null;
			return format(parsedDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
		}
		catch (error)
		{
			console.error('Date formatting error:', error);
			return null;
		}
	}
	_generateId()
	{
		return uuidv4();
	}
	_createStandardMeeting(data = {})
	{
		return {
			id: data.id || this._generateId(),
			title: data.title || 'Untitled Meeting',
			description: data.description || '',
			location: data.location || '',
			startDate: this._formatDate(data.startDate) || this._formatDate(new Date()),
			endDate: this._formatDate(data.endDate) || this._formatDate(new Date(Date.now() + 3600000)), // Default 1 hour
			recordingId: data.recordingId || null,
			shouldRecord: data.shouldRecord || false,
			attendees: Array.isArray(data.attendees) ? data.attendees : [],
			source: this.token || 'unknown',
			// Optional online meeting information (e.g. Google Meet)
			meetingLink: data.meetingLink || null,
			meetingCode: data.meetingCode || null
		};
	}
}
