export type IsoAppointmentSlot = {
  start: string;
  end: string;
  startDate: Date;
  endDate: Date;
};

function utcSlotOnDay(
  reference: Date,
  daysFromReference: number,
  hourUtc: number,
  minuteUtc: number,
  durationMinutes: number,
): IsoAppointmentSlot {
  const startDate = new Date(reference);
  startDate.setUTCDate(startDate.getUTCDate() + daysFromReference);
  startDate.setUTCHours(hourUtc, minuteUtc, 0, 0);
  const endDate = new Date(startDate);
  endDate.setUTCMinutes(endDate.getUTCMinutes() + durationMinutes);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    startDate,
    endDate,
  };
}

/** Named future slots for production integration tests (always in the future vs CI clock). */
export function productionTestSlots(reference: Date = new Date()) {
  const s = (day: number, h: number, m: number, dur = 30) =>
    utcSlotOnDay(reference, day, h, m, dur);

  const fromDate = new Date(reference);
  fromDate.setUTCDate(fromDate.getUTCDate() + 3);
  fromDate.setUTCHours(8, 0, 0, 0);
  const toDate = new Date(fromDate);
  toDate.setUTCHours(18, 0, 0, 0);

  return {
    availabilityWindow: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    httpBook: s(3, 10, 0),
    voiceBook: s(3, 11, 0),
    twilioBook: s(3, 12, 0),
    stolenAttempt: s(3, 11, 0),
    forgedBook: s(3, 12, 0),
    crossPatientBook: s(3, 13, 0),
    voiceAuthBook: s(3, 14, 0),
    affinityVisit: s(3, 9, 0),
    wmBook: s(4, 10, 0),
    calendarConflict: s(3, 15, 0),
    derivedBook: s(4, 11, 0),
    providerErrorBook: s(3, 16, 0),
  };
}

export type ProductionTestSlots = ReturnType<typeof productionTestSlots>;
