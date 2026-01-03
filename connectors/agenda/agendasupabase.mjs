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
 * Please support the project: https://patreon.com/francoislionet
 *
 * ----------------------------------------------------------------------------
 * @file agendasupabase.mjs
 * @author FL (Francois Lionet)
 * @version 0.5
 *
 * @short Supabase Agenda connector.
 *
 */
import ConnectorAgendaBase from './agendabase.mjs'

export { ConnectorAgendaSupabase as Connector }

class ConnectorAgendaSupabase extends ConnectorAgendaBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Supabase Agenda';
		this.className = 'ConnectorAgendaSupabase';
		this.token = 'agendasupabase';
		this.version = '0.5';
		this.tableName = 'meetings';
	}

	async connect(options)
	{
		await super.connect(options);
		return this.setConnected(true);
	}

	async registerEditor(args, basket, control)
	{
		var info = await super.registerEditor(args, basket, control);
		info[this.token].commands.signOut = this.command_signOut.bind(this);
		info[this.token].commands.listMeetings = this.command_listMeetings.bind(this);
		info[this.token].commands.createMeeting = this.command_createMeeting.bind(this);
		info[this.token].commands.updateMeeting = this.command_updateMeeting.bind(this);
		info[this.token].commands.deleteMeeting = this.command_deleteMeeting.bind(this);
		info[this.token].commands.getMeeting = this.command_getMeeting.bind(this);
		info[this.token].commands.command_linkRecording = this.command_linkRecording.bind(this);
		return this.newAnswer(info);
	}

	async command_signOut(parameters, message, editor)
	{
		return this.replySuccess(this.newAnswer(true), message, editor);
	}

	async _fetchMeetings(parameters)
	{
		try
		{
			const filters = [
				{ column: 'user_id', operator: 'eq', value: parameters.userId },
				{ column: 'start_time', operator: 'gte', value: parameters.startDate }
			];
			if (parameters.endDate)
				filters.push({ column: 'start_time', operator: 'lte', value: parameters.endDate });
			const result = await this.awi.database.queryRecords(
			{
				table: this.tableName,
				columns: '*',
				filters: filters,
				orderBy: 'start_time',
				orderDirection: 'asc',
				limit: parameters.limit
			});
			if (result.isError())
				return result;
			const meetings = result.data.map(record => this._convertSupabaseRecordToMeeting(record));
			return this.newAnswer(meetings);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-list-error', data: error }, { stack: new Error().stack });
		}
	}

	async _createMeeting(parameters)
	{
		try
		{
			const record = this._convertMeetingToSupabaseRecord(parameters.meeting);
			record.user_id = parameters.userId;
			record.created_at = new Date().toISOString();
			record.updated_at = record.created_at;
			const result = await this.awi.database.insertRecord(
			{
				table: this.tableName,
				record: record
			});
			if (result.isError())
				return result;
			return this.newAnswer(this._convertSupabaseRecordToMeeting(result.data));
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-create-error', data: error }, { stack: new Error().stack });
		}
	}

	async _updateMeeting(parameters)
	{
		try
		{
			const record = this._convertMeetingToSupabaseRecord(parameters.meeting);
			record.updated_at = new Date().toISOString();
			const result = await this.awi.database.updateRecord(
			{
				table: this.tableName,
				filters: [
					{ column: 'id', operator: 'eq', value: parameters.meetingId },
					{ column: 'user_id', operator: 'eq', value: parameters.userId }
				],
				update: record
			});
			if (result.isError())
				return result;
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-update-error', data: error }, { stack: new Error().stack });
		}
	}

	async _deleteMeeting(parameters)
	{
		try
		{
			const result = await this.awi.database.deleteRecord(
			{
				table: this.tableName,
				filters: [
					{ column: 'id', operator: 'eq', value: parameters.meetingId },
					{ column: 'user_id', operator: 'eq', value: parameters.userId }
				]
			});
			if (result.isError())
				return result;
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-delete-error', data: error }, { stack: new Error().stack });
		}
	}

	async _getMeeting(parameters)
	{
		try
		{
			const result = await this.awi.database.queryRecords(
			{
				table: this.tableName,
				columns: '*',
				filters: [
					{ column: 'id', operator: 'eq', value: parameters.meetingId },
					{ column: 'user_id', operator: 'eq', value: parameters.userId }
				]
			});
			if (result.isError())
				return result;
			return this.newAnswer(this._convertSupabaseRecordToMeeting(result.data[0]));
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-get-error', data: error }, { stack: new Error().stack });
		}
	}

	async _linkRecording(parameters)
	{
		try
		{
			const update = await this.awi.database.updateRecord(
			{
				table: this.tableName,
				filters: [
					{ column: 'id', operator: 'eq', value: parameters.meetingId },
					{ column: 'user_id', operator: 'eq', value: parameters.userId }
				],
				update: {
					recording_id: parameters.recordingId,
					updated_at: new Date().toISOString()
				}
			});
			if (update.isError())
				return update;
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-link-error', data: error }, { stack: new Error().stack });
		}
	}

	_convertSupabaseRecordToMeeting(record)
	{
		let attendees = [];
		if (record.attendees)
		{
			try
			{
				attendees = typeof record.attendees === 'string'
					? JSON.parse(record.attendees)
					: record.attendees;
			}
			catch (e)
			{
				console.error('Error parsing attendees:', e);
			}
		}
		return this._createStandardMeeting(
		{
			id: record.id,
			title: record.title || 'Untitled Meeting',
			description: record.description || '',
			location: record.location || '',
			startDate: record.start_time,
			endDate: record.end_time,
			recordingId: record.recording_id || null,
			attendees: attendees,
			source: this.token
		});
	}

	_convertMeetingToSupabaseRecord(meeting)
	{
		const record = {
			title: meeting.title,
			description: meeting.description || '',
			location: meeting.location || '',
			start_time: meeting.startDate,
			end_time: meeting.endDate,
			attendees: JSON.stringify(Array.isArray(meeting.attendees) ? meeting.attendees : [])
		};
		if (meeting.recordingId)
			record.recording_id = meeting.recordingId;
		return record;
	}
}
