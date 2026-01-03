/**
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
 * @file agendagoogle.mjs
 * @author FL (Francois Lionet)
 * @version 0.5
 *
 * @short Google Agenda connector.
 *
 */
import ConnectorAgendaBase from './agendabase.mjs'
import { google } from 'googleapis';
import { parseISO, addMinutes } from 'date-fns';

export { ConnectorAgendaGoogle as Connector }

class ConnectorAgendaGoogle extends ConnectorAgendaBase
{
	constructor(awi, config = {})
	{
		super(awi, config);
		this.name = 'Google Agenda';
		this.className = 'ConnectorAgendaGoogle';
		this.token = 'agendagoogle';
		this.version = '0.5';

		// Google API specific properties
		this.calendar = null;
		this.calendarId = 'primary'; // Default to primary calendar
		this.oauthClient = null;
		this.scopes = [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events'
		];
	}

	async connect(options)
	{
		await super.connect(options);
		this.oauthClient = new google.auth.OAuth2();
		this.calendar = google.calendar({ version: 'v3', auth: this.oauthClient });
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
		info[this.token].commands.createMeetSpace = this.command_createMeetSpace.bind(this);
		return this.newAnswer(info);
	}

	async command_signOut(parameters, message, editor)
	{
		this.oauthClient = new google.auth.OAuth2();
		this.calendar = google.calendar({ version: 'v3', auth: this.oauthClient });
		return this.replySuccess(this.newAnswer({}), message, editor);
	}

	async command_createMeeting(parameters, message, editor)
	{
		return super.command_createMeeting(parameters, message, editor);
	}

	async command_updateMeeting(parameters, message, editor)
	{
		return super.command_updateMeeting(parameters, message, editor);
	}

	async command_deleteMeeting(parameters, message, editor)
	{
		return super.command_deleteMeeting(parameters, message, editor);
	}

	async command_getMeeting(parameters, message, editor)
	{
		return super.command_getMeeting(parameters, message, editor);
	}

	async command_linkRecording(parameters, message, editor)
	{
		return super.command_linkRecording(parameters, message, editor);
	}

	///////////////////////////////////////////////////////////////////////
	// Internal methods
	///////////////////////////////////////////////////////////////////////
	async _fetchMeetings(parameters) 
	{
		try
		{
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError && googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials({ access_token: googleToken.data });

			const params = {
				calendarId: this.calendarId,
				timeMin: parameters.startDate,
				maxResults: 25,
				singleEvents: true,
				orderBy: 'startTime',
				// Do not include deleted events
				showDeleted: false
			};
			if (parameters.endDate)
				params.timeMax = parameters.endDate;
			const response = await this.calendar.events.list(params);
			const items = response.data && Array.isArray(response.data.items) ? response.data.items : [];
			const meetings = items
				// Keep only real meetings: non-cancelled, default eventType, timed, with Meet link or ThinkNotes flags
				.filter(event => 
				{
					// Exclude cancelled events
					if (event.status === 'cancelled')
						return false;
					// Exclude non-default event types (e.g. workingLocation)
					const eventType = event.eventType || 'default';
					if (eventType !== 'default')
						return false;
					// Require a timed event (dateTime) to avoid all-day/working-location rows
					if (!event.start || (!event.start.dateTime && !event.end?.dateTime))
						return false;
					// Detect Google Meet link
					let hasMeetLink = false;
					if (event.hangoutLink && event.hangoutLink.indexOf('https://meet.google.com') >= 0)
						hasMeetLink = true;
					if (!hasMeetLink && event.conferenceData && Array.isArray(event.conferenceData.entryPoints))
					{
						for (const ep of event.conferenceData.entryPoints)
						{
							if (ep.uri && ep.uri.indexOf('https://meet.google.com') >= 0)
							{
								hasMeetLink = true;
								break;
							}
						}
					}
					// Detect Application-specific flags
					let hasAppFlags = false;
					if (event.extendedProperties && event.extendedProperties.private)
					{
						const priv = event.extendedProperties.private;
						hasAppFlags = !!(priv.recordingId || priv.shouldRecord);
					}
					// Keep event if it looks like a meeting
					return hasMeetLink || hasAppFlags;
				})
				.map(event => this._convertGoogleEventToMeeting(event));
			return this.newAnswer(meetings);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-list-error', data: error }, { stack: new Error().stack });
		}
	}

	async command_createMeetSpace(parameters, message, editor)
	{
		// Create a Google Meet meeting space using the Meet REST API.
		// This relies on the user's stored Google OAuth tokens managed by the authentification connector.
		var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
		if (googleToken.isError && googleToken.isError())
			return this.replyError(googleToken, message, editor);
		const accessToken = googleToken.data;

		const url = 'https://meet.googleapis.com/v2/spaces';
		const body = {};
		try
		{
			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Authorization': 'Bearer ' + accessToken,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body)
			});
			const text = await resp.text();
			if (!resp.ok)
			{
				let errData = text;
				try { errData = text ? JSON.parse(text) : text; } catch {}
				return this.replyError(this.newError({ message: 'awi:meet-create-space-failed', data: errData }, { stack: new Error().stack }), message, editor);
			}
			let json = {};
			try { json = text ? JSON.parse(text) : {}; } catch {}
			const name = json.name || '';
			const spaceId = name && name.indexOf('spaces/') === 0 ? name.substring('spaces/'.length) : (name || null);
			const result = {
				spaceName: name || null,
				spaceId: spaceId,
				meetingUri: json.meetingUri || null,
				meetingCode: json.meetingCode || null,
				space: json
			};
			return this.replySuccess(this.newAnswer(result, { stack: new Error().stack }), message, editor);
		}
		catch (error)
		{
			return this.replyError(this.newError({ message: 'awi:meet-create-space-error', data: error }, { stack: new Error().stack }), message, editor);
		}
	}

	async _createMeeting(parameters)
	{
		try
		{
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError && googleToken.isError())
				return googleToken;
			this.oauthClient.setCredentials({ access_token: googleToken.data });

			const event = this._convertMeetingToGoogleEvent(parameters.meeting);
			// Request creation of a Google Meet conference for this event
			const requestId = this._generateId ? this._generateId() : (Date.now().toString());
			event.conferenceData = {
				createRequest:
				{
					requestId: requestId,
					conferenceSolutionKey: { type: 'hangoutsMeet' }
				}
			};
			const response = await this.calendar.events.insert(
			{
				calendarId: this.calendarId,
				resource: event,
				conferenceDataVersion: 1
			});
			const createdEvent = response.data || {};
			return this.newAnswer(this._convertGoogleEventToMeeting(createdEvent));
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
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return this.replyError(googleToken, message, editor);
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const event = this._convertMeetingToGoogleEvent(parameters.meeting);
			const response = await this.calendar.events.update(
			{
				calendarId: this.calendarId,
				eventId: parameters.meetingId,
				resource: event
			});
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
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return this.replyError(googleToken, message, editor);
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			await this.calendar.events.delete(
			{
				calendarId: this.calendarId,
				eventId: parameters.meetingId
			});
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
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return this.replyError(googleToken, message, editor);
			this.oauthClient.setCredentials( { access_token: googleToken.data });

			const response = await this.calendar.events.get(
			{
				calendarId: this.calendarId,
				eventId: parameters.meetingId
			});
			return this.newAnswer(this._convertGoogleEventToMeeting(response.data));
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
			var googleToken = await this.getAuthentification().getGoogleAccessToken(parameters);
			if (googleToken.isError())
				return this.replyError(googleToken, message, editor);
			this.oauthClient.setCredentials( { access_token: googleToken.data });
			
			const response = await this.calendar.events.get(
			{
				calendarId: this.calendarId,
				eventId: parameters.meetingId
			});

			// Update the event
			const event = response.data;
			if (!event.extendedProperties)
				event.extendedProperties = {};
			if (!event.extendedProperties.private)
				event.extendedProperties.private = {};
			event.extendedProperties.private.recordingId = parameters.recordingId;
			await this.calendar.events.update(
			{
				calendarId: this.calendarId,
				eventId: parameters.meetingId,
				resource: event
			});
			return this.newAnswer(true);
		}
		catch (error)
		{
			return this.newError({ message: 'awi:agenda-link-error', data: error }, { stack: new Error().stack });
		}
	}

	_convertGoogleEventToMeeting(event)
	{
		let recordingId = null;
		if (event.extendedProperties && event.extendedProperties.private &&event.extendedProperties.private.recordingId)
			recordingId = event.extendedProperties.private.recordingId;
		let shouldRecord = false;
		if (event.extendedProperties && event.extendedProperties.private && event.extendedProperties.private.shouldRecord)
		{
			const sr = event.extendedProperties.private.shouldRecord;
			shouldRecord = sr === true || sr === 'true' || sr === 1 || sr === '1';
		}
		const attendees = event.attendees ? event.attendees.map(attendee => (
		{
			email: attendee.email,
			name: attendee.displayName || attendee.email,
			status: attendee.responseStatus
		})) : [];
		// Extract Google Meet link and code if present
		let meetingLink = null;
		if (event.hangoutLink && event.hangoutLink.indexOf('https://meet.google.com') >= 0)
			meetingLink = event.hangoutLink;
		if (!meetingLink && event.conferenceData && Array.isArray(event.conferenceData.entryPoints))
		{
			for (const ep of event.conferenceData.entryPoints)
			{
				if (ep.uri && ep.uri.indexOf('https://meet.google.com') >= 0)
				{
					meetingLink = ep.uri;
					break;
				}
			}
		}
		let meetingCode = null;
		if (meetingLink)
		{
			const match = meetingLink.match(/meet\.google\.com\/([a-z0-9\-]+)/i);
			if (match && match[1])
				meetingCode = match[1];
		}
		return this._createStandardMeeting(
		{
			id: event.id,
			title: event.summary || 'Untitled Meeting',
			description: event.description || '',
			location: event.location || '',
			startDate: event.start.dateTime || event.start.date,
			endDate: event.end.dateTime || event.end.date,
			recordingId: recordingId,
			attendees: attendees,
			shouldRecord: shouldRecord,
			source: this.token,
			meetingLink: meetingLink,
			meetingCode: meetingCode
		});
	}

	_convertMeetingToGoogleEvent(meeting)
	{
		const event = {
			summary: meeting.title,
			location: meeting.location || '',
			description: meeting.description || '',
			start: {},
			end: {},
			attendees: []
		};

		const startDate = parseISO(meeting.startDate);
		const endDate = meeting.endDate ? parseISO(meeting.endDate) : addMinutes(startDate, 60);
		event.start.dateTime = startDate.toISOString();
		event.end.dateTime = endDate.toISOString();
		if (Array.isArray(meeting.attendees) && meeting.attendees.length > 0)
		{
			event.attendees = meeting.attendees.map(attendee => (
			{
				email: attendee.email,
				displayName: attendee.name || attendee.email
			}));
		}
		// Mirror recording state into Calendar private extended properties
		if (!event.extendedProperties)
			event.extendedProperties = {};
		if (!event.extendedProperties.private)
			event.extendedProperties.private = {};
		if (meeting.recordingId)
			event.extendedProperties.private.recordingId = meeting.recordingId;
		// When shouldRecord is explicitly provided, set or clear the flag accordingly
		if (typeof meeting.shouldRecord === 'boolean')
			event.extendedProperties.private.shouldRecord = meeting.shouldRecord ? true : false;
		return event;
	}
}
