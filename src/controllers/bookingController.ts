import { Response } from 'express';
import prisma from '../database/database';
import { CustomerRequest } from '../middleware/customerAuth';
import {
  parseDateTime,
  isOverlapping,
  computeDurationHours,
  computeRate,
  computePackageRate,
  getPackagePrice,
  DEFAULT_SECURITY_DEPOSIT,
} from '../utils/rate';
import {
  sendBookingCreatedSms,
  sendBookingConfirmedSms,
  sendBookingCancelledSms,
  sendBookingCompletedSms,
} from '../utils/smsNotifications';

interface AccessorySelection {
  accessoryId: string;
  quantity: number;
}

// Create a booking. The customer JWT is required (enforced in routes).
// Rate and duration are recomputed server-side from the bike + selected
// date/time window; client-supplied values are ignored for pricing.
export const createBooking = async (req: CustomerRequest, res: Response) => {
  try {
    const {
      bikeId,
      customerName,
      customerEmail,
      customerAddress,
      idProof,
      idProofFilePath,
      startDate,
      endDate,
      startTime,
      endTime,
      paymentMethod, // 'razorpay' | 'whatsapp' | 'cash'
      accessories, // [{ accessoryId, quantity }]
      couponCode, // optional coupon code
      packageDays, // optional package (1, 2, 3, 7 days)
    } = req.body;

    // Phone comes from the verified JWT, not the request body.
    const customerPhone = req.customer?.mobile;
    if (!customerPhone) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Validate required fields
    if (!bikeId || !customerName || !customerEmail || !customerAddress ||
        !idProof || !startDate || !endDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if bike exists and is available
    const bike = await prisma.bike.findUnique({
      where: { id: bikeId, available: true },
    });
    if (!bike) {
      return res.status(404).json({ error: 'Bike not available' });
    }

    // Validate requested range
    const requestedStart = parseDateTime(startDate, startTime);
    const requestedEnd = parseDateTime(endDate, endTime);
    if (requestedEnd <= requestedStart) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    // Check for overlapping bookings using full date + time
    const existingBookings = await prisma.booking.findMany({
      where: {
        bikeId,
        status: { notIn: ['cancelled', 'completed'] },
      },
    });

    const hasOverlap = existingBookings.some((booking) => {
      const bookingStart = parseDateTime(booking.startDate, booking.startTime);
      const bookingEnd = parseDateTime(booking.endDate, booking.endTime);
      return isOverlapping(bookingStart, bookingEnd, requestedStart, requestedEnd);
    });

    if (hasOverlap) {
      return res.status(409).json({ error: 'Bike is already booked for the selected time' });
    }

    // Server-side rate + duration recompute (never trust the client)
    const durationHours = computeDurationHours(startDate, startTime, endDate, endTime);
    if (durationHours <= 0) {
      return res.status(400).json({ error: 'Invalid duration' });
    }

    // Use package pricing if a valid package is selected, otherwise fall back to hourly/daily
    const packageDaysNum = packageDays ? parseInt(packageDays, 10) : 0;
    const packagePrice = packageDaysNum > 0 ? getPackagePrice(bike, packageDaysNum) : 0;
    const rateBreakdown = packagePrice > 0
      ? computePackageRate(bike, packageDaysNum)
      : computeRate(bike, durationHours);
    const roundedDuration = rateBreakdown.durationHours;

    // Compute accessories total
    let accessoriesTotal = 0;
    const accessoryRecords: AccessorySelection[] = Array.isArray(accessories) ? accessories : [];
    const bookingAccessoryData: { accessoryId: string; quantity: number; priceAtBooking: number }[] = [];

    if (accessoryRecords.length > 0) {
      const accessoryIds = accessoryRecords.map((a) => a.accessoryId);
      const dbAccessories = await prisma.accessory.findMany({
        where: { id: { in: accessoryIds }, available: true },
      });
      const accessoryMap = new Map(dbAccessories.map((a) => [a.id, a]));

      for (const sel of accessoryRecords) {
        const acc = accessoryMap.get(sel.accessoryId);
        if (!acc) {
          return res.status(400).json({ error: `Accessory ${sel.accessoryId} not available` });
        }
        const qty = Math.max(1, Math.floor(sel.quantity || 1));
        // Price is per day; charge for ceil(durationHours/24) days
        const days = Math.max(1, Math.ceil(roundedDuration / 24));
        const lineTotal = acc.pricePerDay * qty * days;
        accessoriesTotal += lineTotal;
        bookingAccessoryData.push({ accessoryId: acc.id, quantity: qty, priceAtBooking: acc.pricePerDay });
      }
    }

    // Compute coupon discount on (rentalTotal + accessoriesTotal), before GST
    let discountAmount = 0;
    let couponId: string | null = null;
    let couponCodeResolved: string | null = null;
    const preTaxSubtotal = rateBreakdown.rentalTotal + accessoriesTotal;

    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase().trim() },
      });
      if (!coupon || !coupon.active) {
        return res.status(400).json({ error: 'Invalid or inactive coupon code' });
      }
      const now = new Date();
      if (now < new Date(coupon.validFrom) || now > new Date(coupon.validUntil)) {
        return res.status(400).json({ error: 'Coupon has expired or is not yet active' });
      }
      if (coupon.maxUses > 0 && coupon.usesCount >= coupon.maxUses) {
        return res.status(400).json({ error: 'Coupon usage limit reached' });
      }
      if (preTaxSubtotal < coupon.minOrderAmount) {
        return res.status(400).json({ error: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}` });
      }
      if (coupon.discountType === 'percentage') {
        discountAmount = Math.round((preTaxSubtotal * coupon.discountValue) / 100);
      } else {
        discountAmount = coupon.discountValue;
      }
      discountAmount = Math.min(discountAmount, preTaxSubtotal);
      couponId = coupon.id;
      couponCodeResolved = coupon.code;
    }

    // GST applies on the discounted subtotal (rental + accessories - discount)
    const taxableAmount = Math.max(0, preTaxSubtotal - discountAmount);
    const gstAmount = Math.round((taxableAmount * rateBreakdown.gstRate) / 100);
    const calculatedRate = taxableAmount + gstAmount;

    let booking;
    try {
      booking = await prisma.$transaction(async (tx) => {
        // Recheck inside a serializable transaction. The first availability
        // check is for fast feedback; this one closes the race between two
        // simultaneous booking requests.
        const activeBookings = await tx.booking.findMany({
          where: { bikeId, status: { notIn: ['cancelled', 'completed'] } },
        });
        const hasConcurrentOverlap = activeBookings.some((existing) =>
          isOverlapping(
            parseDateTime(existing.startDate, existing.startTime),
            parseDateTime(existing.endDate, existing.endTime),
            requestedStart,
            requestedEnd
          )
        );
        if (hasConcurrentOverlap) throw new Error('BIKE_ALREADY_BOOKED');

        const created = await tx.booking.create({
          data: {
            bikeId,
            customerName,
            customerPhone,
            customerEmail,
            customerAddress,
            idProof,
            idProofFilePath: idProofFilePath || null,
            startDate,
            endDate,
            startTime,
            endTime,
            calculatedRate,
            durationHours: roundedDuration,
            securityDeposit: DEFAULT_SECURITY_DEPOSIT,
            baseAmount: rateBreakdown.rentalTotal,
            gstAmount,
            gstRate: rateBreakdown.gstRate,
            accessoriesTotal,
            discountAmount,
            couponId,
            couponCode: couponCodeResolved,
            packageDays: packagePrice > 0 ? packageDaysNum : null,
            status: 'pending',
            paymentStatus: paymentMethod === 'whatsapp' ? 'whatsapp' : paymentMethod === 'cash' ? 'cash' : 'pending',
            paymentMethod: paymentMethod || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            accessories: {
              create: bookingAccessoryData.map((a) => ({
                accessoryId: a.accessoryId,
                quantity: a.quantity,
                priceAtBooking: a.priceAtBooking,
              })),
            },
          },
          include: { accessories: { include: { accessory: true } } },
        });

        if (couponId) {
          const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
          const couponUpdate = await tx.coupon.updateMany({
            where: {
              id: couponId,
              OR: [
                { maxUses: 0 },
                { usesCount: { lt: coupon?.maxUses ?? 0 } },
              ],
            },
            data: { usesCount: { increment: 1 } },
          });
          if (couponUpdate.count !== 1) throw new Error('COUPON_USAGE_LIMIT');
        }

        // Upsert customer record
        const customer = await tx.customer.upsert({
          where: { phone: customerPhone },
          update: {
            name: customerName,
            email: customerEmail,
            address: customerAddress,
            idProof,
            idProofFilePath: idProofFilePath || undefined,
            totalBookings: { increment: 1 },
            totalSpent: { increment: calculatedRate },
            updatedAt: new Date().toISOString(),
          },
          create: {
            phone: customerPhone,
            name: customerName,
            email: customerEmail,
            address: customerAddress,
            idProof,
            idProofFilePath: idProofFilePath || null,
            totalBookings: 1,
            totalSpent: calculatedRate,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });

        // Link customer to booking
        await tx.booking.update({
          where: { id: created.id },
          data: { customerId: customer.id },
        });

        return created;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2034') {
        return res.status(409).json({ error: 'Booking conflict. Please retry.' });
      }
      if (error instanceof Error && error.message === 'BIKE_ALREADY_BOOKED') {
        return res.status(409).json({ error: 'Bike is already booked for the selected time' });
      }
      if (error instanceof Error && error.message === 'COUPON_USAGE_LIMIT') {
        return res.status(400).json({ error: 'Coupon usage limit reached' });
      }
      throw error;
    }

    // Send SMS notification (async, non-blocking)
    sendBookingCreatedSms(customerPhone, booking.id, bike.name, startDate, startTime).catch(() => {});

    res.status(201).json({
      id: booking.id,
      message: 'Booking created successfully',
      status: booking.status,
      calculatedRate,
      securityDeposit: booking.securityDeposit,
      durationHours: roundedDuration,
      breakdown: {
        baseAmount: rateBreakdown.rentalTotal,
        accessoriesTotal,
        discountAmount,
        gstAmount,
        gstRate: rateBreakdown.gstRate,
        total: calculatedRate,
      },
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

export const getBookingById = async (req: CustomerRequest, res: Response) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { bike: true, accessories: { include: { accessory: true } } },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Only the owner of the booking (or an admin via admin routes) may view it.
    if (req.customer && booking.customerPhone !== req.customer.mobile) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

// Returns bookings for the authenticated customer only.
export const getMyBookings = async (req: CustomerRequest, res: Response) => {
  try {
    const phone = req.customer?.mobile;
    if (!phone) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const bookings = await prisma.booking.findMany({
      where: { customerPhone: phone },
      include: { bike: true, accessories: { include: { accessory: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

export const cancelBooking = async (req: CustomerRequest, res: Response) => {
  try {
    const { id } = req.params;
    const phone = req.customer?.mobile;
    if (!phone) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const existing = await prisma.booking.findUnique({ where: { id }, include: { bike: true } });
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (existing.customerPhone !== phone) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking already cancelled' });
    }
    if (existing.status === 'completed') {
      return res.status(400).json({ error: 'Cannot cancel a completed booking' });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: 'cancelled', updatedAt: new Date().toISOString() },
    });

    // Decrement customer's totalSpent on cancellation
    if (existing.customerId) {
      await prisma.customer.update({
        where: { id: existing.customerId },
        data: { totalSpent: { decrement: existing.calculatedRate } },
      });
    }

    // Send SMS notification
    sendBookingCancelledSms(phone, booking.id, existing.bike.name).catch(() => {});

    res.json({
      message: 'Booking cancelled successfully',
      booking,
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// Single-bike availability check using full datetime (was previously date-only and buggy).
export const checkAvailability = async (req: CustomerRequest, res: Response) => {
  try {
    const { bikeId, startDate, endDate, startTime, endTime } = req.body;

    if (!bikeId || !startDate || !endDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const bike = await prisma.bike.findUnique({
      where: { id: bikeId, available: true },
    });
    if (!bike) {
      return res.status(404).json({ error: 'Bike not available' });
    }

    const requestedStart = parseDateTime(startDate, startTime);
    const requestedEnd = parseDateTime(endDate, endTime);
    if (requestedEnd <= requestedStart) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const existingBookings = await prisma.booking.findMany({
      where: {
        bikeId,
        status: { notIn: ['cancelled', 'completed'] },
      },
    });

    const isBooked = existingBookings.some((booking) => {
      const bookingStart = parseDateTime(booking.startDate, booking.startTime);
      const bookingEnd = parseDateTime(booking.endDate, booking.endTime);
      return isOverlapping(bookingStart, bookingEnd, requestedStart, requestedEnd);
    });

    res.json({
      bikeId,
      available: !isBooked,
      startDate,
      endDate,
      startTime,
      endTime,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
};

export const checkAvailabilityAll = async (req: CustomerRequest, res: Response) => {
  try {
    const { startDate, endDate, startTime, endTime } = req.body;

    if (!startDate || !endDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const requestedStart = parseDateTime(startDate, startTime);
    const requestedEnd = parseDateTime(endDate, endTime);
    if (requestedEnd <= requestedStart) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const bikes = await prisma.bike.findMany({ where: { available: true } });
    const bookings = await prisma.booking.findMany({
      where: {
        status: { notIn: ['cancelled', 'completed'] },
      },
    });

    const availability: Record<string, boolean> = {};

    for (const bike of bikes) {
      const bikeBookings = bookings.filter((b) => b.bikeId === bike.id);
      const isBooked = bikeBookings.some((booking) => {
        const bookingStart = parseDateTime(booking.startDate, booking.startTime);
        const bookingEnd = parseDateTime(booking.endDate, booking.endTime);
        return isOverlapping(bookingStart, bookingEnd, requestedStart, requestedEnd);
      });
      availability[bike.id] = !isBooked;
    }

    res.json({
      availability,
      startDate,
      endDate,
      startTime,
      endTime,
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ error: 'Failed to check availability' });
  }
};

// Server-authoritative rate calculation for a bike + window.
export const calculateRate = async (req: CustomerRequest, res: Response) => {
  try {
    const { bikeId, startDate, endDate, startTime, endTime, durationHours, accessories, couponCode, packageDays } = req.body;

    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
    if (!bike) {
      return res.status(404).json({ error: 'Bike not found' });
    }

    // Use package pricing if a valid package is selected
    const packageDaysNum = packageDays ? parseInt(packageDays, 10) : 0;
    const packagePrice = packageDaysNum > 0 ? getPackagePrice(bike, packageDaysNum) : 0;

    let breakdown;
    if (packagePrice > 0) {
      breakdown = computePackageRate(bike, packageDaysNum);
    } else {
      // Prefer computing duration from the selected window; fall back to client value.
      let hours = durationHours;
      if (startDate && endDate && startTime && endTime) {
        hours = computeDurationHours(startDate, startTime, endDate, endTime);
      }
      if (!hours || hours <= 0) {
        return res.status(400).json({ error: 'Invalid duration' });
      }
      breakdown = computeRate(bike, hours);
    }

    // Compute accessories total
    let accessoriesTotal = 0;
    const accessoryList: { id: string; name: string; quantity: number; lineTotal: number }[] = [];
    const accessoryRecords: AccessorySelection[] = Array.isArray(accessories) ? accessories : [];

    if (accessoryRecords.length > 0) {
      const accessoryIds = accessoryRecords.map((a) => a.accessoryId);
      const dbAccessories = await prisma.accessory.findMany({
        where: { id: { in: accessoryIds }, available: true },
      });
      const accessoryMap = new Map(dbAccessories.map((a) => [a.id, a]));
      const days = Math.max(1, Math.ceil(breakdown.durationHours / 24));

      for (const sel of accessoryRecords) {
        const acc = accessoryMap.get(sel.accessoryId);
        if (!acc) continue;
        const qty = Math.max(1, Math.floor(sel.quantity || 1));
        const lineTotal = acc.pricePerDay * qty * days;
        accessoriesTotal += lineTotal;
        accessoryList.push({ id: acc.id, name: acc.name, quantity: qty, lineTotal });
      }
    }

    // Coupon discount
    let discountAmount = 0;
    let couponInfo: any = null;
    const preTaxSubtotal = breakdown.rentalTotal + accessoriesTotal;

    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase().trim() },
      });
      if (coupon && coupon.active) {
        const now = new Date();
        if (now >= new Date(coupon.validFrom) && now <= new Date(coupon.validUntil)) {
          if (coupon.maxUses === 0 || coupon.usesCount < coupon.maxUses) {
            if (preTaxSubtotal >= coupon.minOrderAmount) {
              if (coupon.discountType === 'percentage') {
                discountAmount = Math.round((preTaxSubtotal * coupon.discountValue) / 100);
              } else {
                discountAmount = coupon.discountValue;
              }
              discountAmount = Math.min(discountAmount, preTaxSubtotal);
              couponInfo = {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
              };
            }
          }
        }
      }
    }

    const taxableAmount = Math.max(0, preTaxSubtotal - discountAmount);
    const gstAmount = Math.round((taxableAmount * breakdown.gstRate) / 100);
    const total = taxableAmount + gstAmount;

    res.json({
      bikeId,
      durationHours: breakdown.durationHours,
      calculatedRate: total,
      securityDeposit: DEFAULT_SECURITY_DEPOSIT,
      breakdown: {
        ...breakdown,
        accessoriesTotal,
        accessories: accessoryList,
        discountAmount,
        coupon: couponInfo,
        taxableAmount,
        gstAmount,
        total,
      },
    });
  } catch (error) {
    console.error('Error calculating rate:', error);
    res.status(500).json({ error: 'Failed to calculate rate' });
  }
};
