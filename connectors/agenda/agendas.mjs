/** --------------------------------------------------------------------------
*
*            / \
*          / _ \               (°°)       Intelligent
*        / ___ \ [ \ [ \  [ \ [   ]       Programmable
*     _/ /   \ \_\  \/\ \/ /  |  | \      Personal
* (_)|____| |____|\_\_/\_\_/  [_| |_] \     Assistant
*
* This file is open-source under the conditions contained in the
* license file located at the root of this project.
*
* ----------------------------------------------------------------------------
* @file agendas.mjs
* @author FL (Francois Lionet)
* @version 0.5
*
* @short Agenda connector: makes the link with any agenda
*
*/
import ConnectorBase from '../../connector.mjs'
import { Connector as ConnectorAgendaGoogle } from './agendagoogle.mjs';
import { Connector as ConnectorAgendaSupabase } from './agendasupabase.mjs';
import { Connector as ConnectorAgendaZoom } from './agendazoom.mjs';
export { ConnectorAgendas as Connector }

class ConnectorAgendas extends ConnectorBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Agendas';
		this.token = 'agendas';
		this.className = 'ConnectorAgendas';
		this.group = 'agenda';
		this.version = '0.5';
		this.agendas = {};
		this.current = null;
		this.userId = null;
		this.userName = null;
	}

	async connect(options)
	{
		super.connect(options);
		var error = false;
		for (var e in options.agendas)
		{
			var answer = await this.addAgenda(e, options.agendas[e].config, options.agendas[e].options);
			error |= answer.isError();
		}
		return this.setConnected(!error);
	}

	async addAgenda(agenda, config = {}, options = {})
	{
		try
		{
			if (typeof agenda == 'string')
			{
				config.parent = this;
				agenda = agenda.toLowerCase();
				if (agenda == 'google')
					agenda = new ConnectorAgendaGoogle(this.awi, config);
				else if (agenda == 'supabase')
					agenda = new ConnectorAgendaSupabase(this.awi, config);
				else if (agenda == 'zoom')
					agenda = new ConnectorAgendaZoom(this.awi, config);
			}
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-add-error', data: agenda }, { stack: new Error().stack });
		}
		if (!agenda)
			return this.newError({ message: 'awi:agenda-not-found', data: agenda }, { stack: new Error().stack });

		var answer = await agenda.connect( options );
		if (answer.isError())
			return answer;
		this[agenda.token] = agenda;
		this.agendas[agenda.token] = agenda;
		return answer;
	}

	getAgenda(handle)
	{
		return this[handle];
	}

	close(agenda)
	{
		if (typeof agenda == 'string')
			agenda = this[agenda];
		if (!agenda)
			return;

		agenda.close();
		delete this.agendas[agenda.token];
		delete this[agenda.token];
		if (this.current == agenda)
			this.current = null;
	}

	async setUser(args, basket, control)
	{
		if (args.userId)
			this.userId = args.userId;
		if (args.userName)
			this.userName = args.userName;
		for (var e in this.agendas)
			this.agendas[e].setUser(args, basket, control);
		return this.newAnswer(true);
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
		data[this.token].commands.listMeetings = this.command_listMeetings.bind(this);
		data[this.token].commands.createMeeting = this.command_createMeeting.bind(this);
		data[this.token].commands.updateMeeting = this.command_updateMeeting.bind(this);
		data[this.token].commands.deleteMeeting = this.command_deleteMeeting.bind(this);
		data[this.token].commands.getMeeting = this.command_getMeeting.bind(this);
		data[this.token].commands.linkRecording = this.command_linkRecording.bind(this);
		return this.newAnswer( data );
	}

	async command( message, editor )
	{
		if ( this[ 'command_' + message.command ] )
			return this[ 'command_' + message.command ]( message.parameters, message, editor );
		return this.replyError( this.newError({ message: 'awi:command-not-found', data: message.command }, { stack: new Error().stack }), message, editor );
	}

	async command_listMeetings(parameters, message, editor)
	{
		const errors = [];
		const allMeetings = [];
		const promises = Object.values(this.agendas).map(async (agenda) => 
		{
			const meetings = await agenda.command_listMeetings(parameters);
			if (meetings.isSuccess())
				return meetings.data;
			return [];
		});
		const results = await Promise.all(promises);
		results.forEach(meetings => 
		{
			if (Array.isArray(meetings))
				allMeetings.push(...meetings);
		});
		allMeetings.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
		return this.replySuccess(this.newAnswer(allMeetings), message, editor);
	}

	async command_createMeeting(parameters, message, editor)
	{
		let targetAgenda = this.agendas['agendasupabase'] || Object.values(this.agendas)[0];
		if (parameters.source && this.agendas[parameters.source])
			targetAgenda = this.agendas[parameters.source];
		if (!targetAgenda)
			return this.replyError(this.newError({ message: 'awi:agenda-not-found' }, { stack: new Error().stack }), message, editor);
		const result = await targetAgenda.command_createMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_updateMeeting(parameters, message, editor)
	{
		let targetAgenda;
		if (parameters.meeting.source && this.agendas[parameters.meeting.source])
			targetAgenda = this.agendas[parameters.meeting.source];
		else if (parameters.source && this.agendas[parameters.source])
			targetAgenda = this.agendas[parameters.source];
		else
		{	
			for (const agenda of Object.values(this.agendas))
			{
				const getMeetingParams = {
					userId: parameters.userId,
					userName: parameters.userName,
					meetingId: parameters.meetingId
				};
				const meeting = await agenda.command_getMeeting(getMeetingParams);
				if (meeting.isSuccess())
				{
					targetAgenda = agenda;
					break;
				}
			}
		}
		if (!targetAgenda)
			return this.replyError(this.newError({ message: 'awi:meeting-not-found' }, { stack: new Error().stack }), message, editor);
		const result = await targetAgenda.command_updateMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_deleteMeeting(parameters, message, editor)
	{
		let targetAgenda;
		if (parameters.source && this.agendas[parameters.source])
			targetAgenda = this.agendas[parameters.source];
		else
		{
			for (const agenda of Object.values(this.agendas))
			{
				const getMeetingParams = {
					userId: parameters.userId,
					userName: parameters.userName,
					meetingId: parameters.meetingId
				};
				const meeting = await agenda.command_getMeeting(getMeetingParams);
				if (meeting.isSuccess())
				{
					targetAgenda = agenda;
					break;
				}
			}
		}
		if (!targetAgenda)
			return this.replyError(this.newError({ message: 'awi:meeting-not-found' }, { stack: new Error().stack }), message, editor);
		const result = await targetAgenda.command_deleteMeeting(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}

	async command_getMeeting(parameters, message, editor)
	{
		if (parameters.source && this.agendas[parameters.source])
		{
			const result = await this.agendas[parameters.source].command_getMeeting(parameters);
			if (result.isSuccess())
				return this.replySuccess(result, message, editor);
			return this.replyError(result, message, editor);
		}
		for (const agenda of Object.values(this.agendas))
		{
			const result = await agenda.command_getMeeting(parameters);
			if (result.isSuccess())
				return this.replySuccess(result, message, editor);
			return this.replyError(this.newError({ message: 'awi:meeting-not-found' }, { stack: new Error().stack }), message, editor);
		}
	}

	async command_linkRecording(parameters, message, editor)
	{
		let targetAgenda;
		if (parameters.source && this.agendas[parameters.source])
			targetAgenda = this.agendas[parameters.source];
		else
		{
			for (const agenda of Object.values(this.agendas))
			{
				const getMeetingParams = {
					userId: parameters.userId,
					userName: parameters.userName,
					meetingId: parameters.meetingId
				};
				const meeting = await agenda.command_getMeeting(getMeetingParams);
				if (meeting.isSuccess())
				{
					targetAgenda = agenda;
					break;
				}
			}
		}
		if (!targetAgenda)
			return this.replyError(this.newError({ message: 'awi:meeting-not-found' }, { stack: new Error().stack }), message, editor);
		const result = await targetAgenda.command_linkRecording(parameters);
		if (result.isError())
			return this.replyError(result, message, editor);
		return this.replySuccess(result, message, editor);
	}
}
