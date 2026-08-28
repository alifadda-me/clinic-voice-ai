import { defineCalendarGatewayContract } from './calendar-gateway.contract.js';
import { InMemoryCalendarGateway } from '../../src/infrastructure/memory/platform/calendar-gateway.js';
import { GoogleCalendarGateway } from '../../src/infrastructure/calendar/google/google-calendar-gateway.js';
import { FakeGoogleCalendarApiClient } from '../helpers/fake-google-calendar-api.js';

defineCalendarGatewayContract(
  'InMemoryCalendarGateway',
  () => new InMemoryCalendarGateway(),
);

defineCalendarGatewayContract('GoogleCalendarGateway (fake API)', () => {
  const api = new FakeGoogleCalendarApiClient();
  return new GoogleCalendarGateway(api, {
    timeZone: 'Africa/Cairo',
    defaultCalendarId: 'primary',
  });
});
