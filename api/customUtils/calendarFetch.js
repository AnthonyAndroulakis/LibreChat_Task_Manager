require('dotenv').config();
const { google } = require('googleapis');
const { DateTime } = require('luxon');

const TIMEZONE = 'America/New_York';

/**
 * Load Authorization using the standard Client + Token env vars
 */
function getAuthClient() {
  if (!process.env.GOOGLE_CLIENT_JSON) {
    throw new Error("Missing GOOGLE_CLIENT_JSON environment variable.");
  }
  const clientData = JSON.parse(process.env.GOOGLE_CLIENT_JSON);
  const keys = clientData.installed || clientData.web;

  if (!process.env.GOOGLE_EMAIL_TOKEN_JSON) {
    throw new Error("Missing GOOGLE_EMAIL_TOKEN_JSON environment variable.");
  }
  const tokenData = JSON.parse(process.env.GOOGLE_EMAIL_TOKEN_JSON);

  const oAuth2Client = new google.auth.OAuth2(
    keys.client_id,
    keys.client_secret,
    'http://localhost'
  );

  oAuth2Client.setCredentials(tokenData);

  return oAuth2Client;
}

/**
 * Main function: Fetch events for the next 30 days.
 */
async function listCalendar() {
  try {
    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    // --- Date Logic: Next 30 Days (Including Today) ---
    const now = DateTime.now().setZone(TIMEZONE);
    const startDateTime = now.startOf('day');
    const endDateTime = startDateTime.plus({ days: 29 }).endOf('day');

    const calendarListRes = await calendar.calendarList.list();
    const calendarList = calendarListRes.data.items;
    let allEvents = [];

    for (const calEntry of calendarList) {
      const calendarId = calEntry.id;
      const calendarSummary = calEntry.summary || calendarId;

      try {
        const eventsRes = await calendar.events.list({
          calendarId: calendarId,
          timeMin: startDateTime.toISO(),
          timeMax: endDateTime.toISO(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        const events = eventsRes.data.items;

        if (events && events.length > 0) {
          events.forEach((event) => {
            const isAllDay = !!event.start.date;
            let startObj, endObj;

            if (isAllDay) {
              startObj = DateTime.fromISO(event.start.date, { zone: TIMEZONE });
              endObj = DateTime.fromISO(event.end.date, { zone: TIMEZONE }); 
            } else {
              startObj = DateTime.fromISO(event.start.dateTime).setZone(TIMEZONE);
              endObj = DateTime.fromISO(event.end.dateTime).setZone(TIMEZONE);
            }

            allEvents.push({
              calendar: calendarSummary,
              summary: event.summary || 'No Title',
              location: event.location || null,
              description: event.description || null,
              _start: startObj, 
              _end: endObj,
              _isAllDay: isAllDay
            });
          });
        }
      } catch (e) {
        // Skip calendars that fail or are empty
      }
    }

    allEvents.sort((a, b) => a._start.toMillis() - b._start.toMillis());

    const prettyEvents = allEvents.map(ev => {
      const pDate = ev._start.toFormat('LLL-dd-yyyy hh:mm a'); 
      let timeStr = "";

      if (ev._isAllDay) {
        timeStr = "All Day";
      } else {
        timeStr = ev._start.toFormat('hh:mm a'); 
        if (ev._end) {
          timeStr += ` - ${ev._end.toFormat('hh:mm a')}`;
        }
      }

      var finalStr = `[${ev.calendar}] ${ev.summary}`;

      if (ev.description)
        finalStr += ` (${ev.description})`;

      if (ev.location)
        finalStr += ` @ location ${ev.location}`;

      finalStr += ` on ${pDate} (${timeStr})`;

      return finalStr;
    });

    var resultsStr = JSON.stringify(prettyEvents, null, 2);
    resultsStr = resultsStr.replace('<context>', '').replace('</context>', '').replace('<time>', '').replace('</time>', '');

    return resultsStr;

  } catch (error) {
    console.error('Error:', error.message);
    var errStr = JSON.stringify(`Error: ${error.message}`, null, 2);
    errStr = errStr.replace('<context>', '').replace('</context>', '').replace('<time>', '').replace('</time>', '');
    return errStr;
  }
}

module.exports = listCalendar;