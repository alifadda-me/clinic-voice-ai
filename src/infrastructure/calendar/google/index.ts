import { GoogleCalendarGateway } from './google-calendar-gateway.js';
import {
  GoogleApisCalendarClient,
  type GoogleCalendarCredentials,
} from './googleapis-client.js';
import type { GoogleCalendarGatewayConfig } from './google-calendar-gateway.js';
import type { GoogleCalendarApiClient } from './google-calendar-api.js';

export function createGoogleCalendarGateway(params: {
  credentials: GoogleCalendarCredentials;
  config: GoogleCalendarGatewayConfig;
  api?: GoogleCalendarApiClient;
}): GoogleCalendarGateway {
  const api =
    params.api ?? new GoogleApisCalendarClient(params.credentials);
  return new GoogleCalendarGateway(api, params.config);
}

export { GoogleCalendarGateway } from './google-calendar-gateway.js';
export { GoogleApisCalendarClient } from './googleapis-client.js';
export type { GoogleCalendarApiClient } from './google-calendar-api.js';
export type { GoogleCalendarGatewayConfig } from './google-calendar-gateway.js';
export {
  encodeReservationId,
  decodeReservationId,
} from './google-calendar-gateway.js';
