import prisma from '../database/database';

// GST rate for motor vehicle renting in India. Configurable via env.
export const GST_RATE = parseInt(process.env.GST_RATE || '5', 10);

export interface RateBreakdown {
  baseRate: number;
  extraHours: number;
  extraHourlyRate: number;
  extraCharge: number;
  rentalTotal: number; // base + extra (pre-GST, pre-accessories)
  gstRate: number;
  gstAmount: number;
  totalRate: number; // rentalTotal + gstAmount (what the customer pays for the bike)
  durationHours: number;
}

// Compute the rental rate for a bike given a duration in hours.
// Mirrors the customer-facing logic but lives server-side so the
// booking amount can never be tampered with by the client.
export const computeRate = (
  bike: { baseRatePerHour: number; baseRate12Hours: number; baseRate24Hours: number },
  durationHours: number
): RateBreakdown => {
  const duration = Math.max(0, Math.ceil(durationHours));

  let baseRate: number;
  let extraHours = 0;
  let extraCharge = 0;

  if (duration <= 12) {
    baseRate = bike.baseRate12Hours;
  } else if (duration <= 24) {
    baseRate = bike.baseRate24Hours;
  } else {
    // Beyond 24h: charge by full 24-hour blocks at the 24hr rate,
    // then hourly for any remaining partial hours (capped at the 24hr rate
    // so a partial day never costs more than a full day).
    const fullDays = Math.floor(duration / 24);
    const remainingHours = duration - fullDays * 24;

    baseRate = bike.baseRate24Hours * fullDays;
    if (remainingHours > 0) {
      extraHours = remainingHours;
      // Cap the partial-day charge at the 24hr rate so e.g. 36h never costs
      // more than 48h, and 47h never costs more than 48h.
      const hourlyCharge = extraHours * bike.baseRatePerHour;
      extraCharge = Math.min(hourlyCharge, bike.baseRate24Hours);
    }
  }

  const rentalTotal = baseRate + extraCharge;
  const gstAmount = Math.round((rentalTotal * GST_RATE) / 100);
  const totalRate = rentalTotal + gstAmount;

  return {
    baseRate,
    extraHours,
    extraHourlyRate: bike.baseRatePerHour,
    extraCharge,
    rentalTotal,
    gstRate: GST_RATE,
    gstAmount,
    totalRate,
    durationHours: duration,
  };
};

// Compute duration (in hours, fractional) between two date+time strings.
// dateStr: "YYYY-MM-DD", timeStr: "7:00 AM" / "10:30 PM"
export const computeDurationHours = (
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string
): number => {
  const start = parseDateTime(startDate, startTime);
  const end = parseDateTime(endDate, endTime);
  const ms = end.getTime() - start.getTime();
  return ms / (1000 * 60 * 60);
};

// Parse "YYYY-MM-DD" + "7:00 AM" / "10:30 PM" into a Date object
export const parseDateTime = (dateStr: string, timeStr: string): Date => {
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3].toUpperCase();

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  const date = new Date(`${dateStr}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export const isOverlapping = (
  bookingStart: Date,
  bookingEnd: Date,
  requestedStart: Date,
  requestedEnd: Date
): boolean => {
  return bookingStart < requestedEnd && bookingEnd > requestedStart;
};

// Default refundable security deposit (in INR). Can be overridden per bike later.
export const DEFAULT_SECURITY_DEPOSIT = 500;

export const getSecurityDeposit = async (): Promise<number> => {
  const setting = await prisma.appSetting.findUnique({ where: { key: 'securityDeposit' } });
  const value = Number(setting?.value);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_SECURITY_DEPOSIT;
};

// Fetch a bike and compute the rate for a given duration, throwing if the bike is missing.
export const computeRateForBike = async (bikeId: string, durationHours: number) => {
  const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
  if (!bike) {
    throw new Error('Bike not found');
  }
  return computeRate(bike, durationHours);
};

// Get the package price for a given number of days. Returns 0 if the package
// is not available (price is 0 or undefined) for this bike.
export const getPackagePrice = (
  bike: { price1Day: number; price2Days: number; price3Days: number; price7Days: number },
  days: number
): number => {
  switch (days) {
    case 1: return bike.price1Day;
    case 2: return bike.price2Days;
    case 3: return bike.price3Days;
    case 7: return bike.price7Days;
    default: return 0;
  }
};

// Check which packages are available for a bike (price > 0)
export const getAvailablePackages = (
  bike: { price1Day: number; price2Days: number; price3Days: number; price7Days: number }
): { days: number; price: number }[] => {
  const packages: { days: number; price: number }[] = [];
  if (bike.price1Day > 0) packages.push({ days: 1, price: bike.price1Day });
  if (bike.price2Days > 0) packages.push({ days: 2, price: bike.price2Days });
  if (bike.price3Days > 0) packages.push({ days: 3, price: bike.price3Days });
  if (bike.price7Days > 0) packages.push({ days: 7, price: bike.price7Days });
  return packages;
};

// Compute rate using a package price instead of the hourly/daily calculation.
export const computePackageRate = (
  bike: { baseRatePerHour: number; baseRate12Hours: number; baseRate24Hours: number; price1Day: number; price2Days: number; price3Days: number; price7Days: number },
  packageDays: number
): RateBreakdown => {
  const packagePrice = getPackagePrice(bike, packageDays);
  const durationHours = packageDays * 24;

  return {
    baseRate: packagePrice,
    extraHours: 0,
    extraHourlyRate: bike.baseRatePerHour,
    extraCharge: 0,
    rentalTotal: packagePrice,
    gstRate: GST_RATE,
    gstAmount: Math.round((packagePrice * GST_RATE) / 100),
    totalRate: packagePrice + Math.round((packagePrice * GST_RATE) / 100),
    durationHours,
  };
};
