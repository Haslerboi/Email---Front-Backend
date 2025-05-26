import { google } from 'googleapis';
import { config } from '../config/env.js';

const createOAuth2Client = async () => {
  const oAuth2Client = new google.auth.OAuth2(
    config.gmail.clientId,
    config.gmail.clientSecret,
    config.gmail.redirectUri
  );
  oAuth2Client.setCredentials({ refresh_token: config.gmail.refreshToken });
  return oAuth2Client;
};

export const checkAvailability = async ({ start, end, calendarId = 'primary' }) => {
  const auth = await createOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });
  const timeMin = new Date(start).toISOString();
  const timeMax = new Date(end).toISOString();
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 1
  });
  const events = res.data.items || [];
  return events.length === 0; // true if available, false if busy
};

export default { checkAvailability }; 