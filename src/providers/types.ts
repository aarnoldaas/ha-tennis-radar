export interface TimeSlot {
  courtId: string;
  courtName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  durationMinutes: number;
  status: 'available' | 'booked' | 'blocked';
  price?: number;
  provider: 'teniso_pasaulis' | 'baltic_tennis';
}

export interface ICourtProvider {
  readonly name: string;
  readonly key: 'teniso_pasaulis' | 'baltic_tennis';
  getAvailability(date: string): Promise<TimeSlot[]>;
}
