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
 * @file agendazoom.mjs
 * @author FL (Francois Lionet)
 * @version 0.5
 *
 * @short Zoom Agenda connector.
 *
 */
import ConnectorAgendaBase from './agendabase.mjs'

export { ConnectorAgendaZoom as Connector }

class ConnectorAgendaZoom extends ConnectorAgendaBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Zoom Agenda';
		this.className = 'ConnectorAgendaZoom';
		this.token = 'agendazoom';
		this.version = '0.5';
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
		info[this.token].commands.command_getMeeting = this.command_getMeeting.bind(this);
		info[this.token].commands.command_linkRecording = this.command_linkRecording.bind(this);
		return this.newAnswer(info);
	}

	async _fetchMeetings(parameters)
	{
		try
		{	
			const userId = (parameters.userId || parameters.user_id);
			let accessToken = parameters.ztoken;
			if (!accessToken && userId)
				accessToken = await this.awi.zoomrtms.getAccessTokenForUser(userId);
			if (!accessToken)
				return this.newError({ message: 'Missing Zoom access token (parameters.ztoken or user-linked token)' }, { functionName: '_fetchMeetings' });

			const pageSize = Math.min(Math.max(parseInt(parameters.limit ? parameters.limit : 30), 1), 300);
			const url = `https://api.zoom.us/v2/users/me/meetings?type=upcoming&page_size=${pageSize}`;
			const resp = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			});
			if (!resp.ok)
			{
				const txt = await resp.text();
				return this.newError({ message: 'awi:agenda-list-error', data: `Zoom list meetings failed: ${resp.status} ${txt}` });
			}
			const data = await resp.json();
			const list = Array.isArray(data && data.meetings) ? data.meetings : [];
			const meetings = list.map((m) =>
			{
				const startISO = m.start_time || new Date().toISOString();
				const durationMin = typeof m.duration === 'number' ? m.duration : 60;
				const endISO = new Date(new Date(startISO).getTime() + durationMin * 60000).toISOString();
				return this._createStandardMeeting({
					id: String(m.id ?? m.uuid ?? this._generateId()),
					title: m.topic || 'Zoom Meeting',
					description: '',
					location: m.join_url || '',
					startDate: startISO,
					endDate: endISO,
					attendees: [],
					shouldRecord: false,
					source: this.token
				});
			});
			return this.newAnswer(meetings);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-list-error', data: error }, { functionName: '_fetchMeetings' });
		}
	}

	async _createMeeting(parameters)
	{
		return this.newError({ message: 'awi:agenda-create-error', data: 'Not implemented: Zoom createMeeting' });
	}

	async _updateMeeting(parameters)
	{
		return this.newError({ message: 'awi:agenda-update-error', data: 'Not implemented: Zoom updateMeeting' });
	}

	async _deleteMeeting(parameters)
	{
		return this.newError({ message: 'awi:agenda-delete-error', data: 'Not implemented: Zoom deleteMeeting' });
	}

	async _getMeeting(parameters)
	{
		try
		{
			const userId = parameters.userId || parameters.user_id;
			let accessToken = parameters.ztoken;
			if (!accessToken && userId)
				accessToken = await this.awi.zoomrtms.getAccessTokenForUser(userId);
			if (!accessToken && this.awi.zoomrtms && this.awi.zoomrtms.getTestAccessToken)
				accessToken = zoomrtms.getTestAccessToken();
			if (!accessToken)
				return this.newError({ message: 'awi:agenda-get-error', data: 'Missing Zoom access token (parameters.ztoken or user-linked token)' }, { functionName: '_getMeeting' });
			const meetingId = encodeURIComponent(parameters.meetingId);
			const url = `https://api.zoom.us/v2/meetings/${meetingId}`;
			const resp = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			});
			if (!resp.ok)
			{
				const txt = await resp.text();
				return this.newError({ message: 'awi:agenda-get-error', data: `Zoom get meeting failed: ${resp.status} ${txt}` });
			}
			const m = await resp.json();
			const startISO = m.start_time || new Date().toISOString();
			const durationMin = typeof m.duration === 'number' ? m.duration : 60;
			const endISO = new Date(new Date(startISO).getTime() + durationMin * 60000).toISOString();
			var meeting = this._createStandardMeeting({
				id: String(m.id ?? m.uuid ?? parameters.meetingId),
				title: m.topic || 'Zoom Meeting',
				description: m.agenda || '',
				location: m.join_url || '',
				startDate: startISO,
				endDate: endISO,
				attendees: [],
				shouldRecord: false,
				source: this.token
			});
			return this.newAnswer(meeting);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-get-error', data: error }, { functionName: '_getMeeting' });
		}
	}
	async _linkRecording(parameters)
	{
		return this.newError({ message: 'awi:agenda-link-error', data: 'Not implemented: Zoom linkRecording' }, { functionName: '_linkRecording' });
	}
}
