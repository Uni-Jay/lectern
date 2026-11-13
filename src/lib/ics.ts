// A daily calendar reminder the student can add to their phone's calendar.
function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function reminderIcs(time: string, name: string, appUrl: string): string {
  const [h, m] = time.split(":").map(Number);
  const start = new Date();
  start.setHours(h || 19, m || 0, 0, 0);
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  const local = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(start.getHours())}${pad(start.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lectern//Study reminder//EN",
    "BEGIN:VEVENT",
    `UID:lectern-daily-${Date.now()}@lectern`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local}`,
    "DURATION:PT30M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:Study time, ${name}`,
    `DESCRIPTION:Your plan for today is ready in Lectern. ${appUrl}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Your Lectern study session is ready",
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
