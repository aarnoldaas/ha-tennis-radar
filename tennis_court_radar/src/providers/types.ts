export interface TimeSlot {
  courtId: string;
  courtName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  durationMinutes: number;
  status: 'available' | 'booked' | 'blocked';
  price?: number;
  provider: 'SEB' | 'BT';
}

export interface Booking {
  courtName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  durationMinutes: number;
  price?: string;
  status?: string;
  provider: 'SEB' | 'BT';
}

export interface ICourtProvider {
  readonly name: string;
  readonly key: 'SEB' | 'BT';
  getAvailability(dates: string[]): Promise<TimeSlot[]>;
  getBookings?(): Promise<Booking[]>;
}
