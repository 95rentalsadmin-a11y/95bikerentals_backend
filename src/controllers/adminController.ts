import { Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../database/database';
import { AdminRequest } from '../middleware/adminAuth';
import { parseDateTime, computeDurationHours } from '../utils/rate';
import { downloadFromR2 } from '../config/r2';
import {
  sendBookingConfirmedSms,
  sendBookingCancelledSms,
  sendBookingCompletedSms,
} from '../utils/smsNotifications';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (process.env.NODE_ENV === 'production' ? '' : 'admin');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret';

export const loginAdmin = async (req: AdminRequest, res: Response) => {
  try {
    const { username, password } = req.body;
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: 'admin-1', username: ADMIN_USERNAME, role: 'admin' }, JWT_SECRET, {
      expiresIn: '24h',
    });

    res.json({
      token,
      user: { id: 'admin-1', username: ADMIN_USERNAME, role: 'admin' },
    });
  } catch (error) {
    console.error('Error logging in admin:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
};

export const getDashboardStats = async (req: AdminRequest, res: Response) => {
  try {
    const totalBookings = await prisma.booking.count();
    const activeBookings = await prisma.booking.count({
      where: {
        status: { in: ['pending', 'confirmed'] },
      },
    });
    const totalBikes = await prisma.bike.count();
    const availableBikes = await prisma.bike.count({ where: { available: true } });
    const pendingBookings = await prisma.booking.count({ where: { status: 'pending' } });
    const revenueAggregate = await prisma.booking.aggregate({
      where: { status: { not: 'cancelled' }, paymentStatus: 'paid' },
      _sum: { calculatedRate: true },
    });
    const pendingPayments = await prisma.booking.count({
      where: { paymentStatus: 'pending' },
    });
    const paidBookings = await prisma.booking.count({ where: { paymentStatus: 'paid' } });

    res.json({
      totalBookings,
      activeBookings,
      totalBikes,
      availableBikes,
      pendingBookings,
      totalRevenue: revenueAggregate._sum.calculatedRate || 0,
      pendingPayments,
      paidBookings,
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

export const getAllBookings = async (req: AdminRequest, res: Response) => {
  try {
    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    // Filters
    const search = (req.query.search as string)?.trim() || '';
    const status = (req.query.status as string)?.trim() || '';
    const paymentStatus = (req.query.paymentStatus as string)?.trim() || '';
    const startDate = (req.query.startDate as string)?.trim() || '';
    const endDate = (req.query.endDate as string)?.trim() || '';

    // Build where clause
    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    if (paymentStatus && paymentStatus !== 'all') {
      where.paymentStatus = paymentStatus;
    }
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { id: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }
    // Date range filter (based on booking startDate)
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = startDate;
      if (endDate) where.startDate.lte = endDate;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: { bike: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    const formatted = bookings.map((booking) => ({
      ...booking,
      bikeName: booking.bike?.name || 'Unknown Bike',
    }));

    res.json({
      bookings: formatted,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

export const downloadBookingIdProof = async (req: AdminRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      select: { idProofFilePath: true },
    });
    if (!booking?.idProofFilePath) {
      return res.status(404).json({ error: 'ID proof not found' });
    }

    const object = await downloadFromR2(booking.idProofFilePath);
    if (!object.Body) {
      return res.status(404).json({ error: 'ID proof not found' });
    }
    res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    (object.Body as any).pipe(res);
  } catch (error) {
    console.error('Error downloading booking ID proof:', error);
    res.status(500).json({ error: 'Failed to download ID proof' });
  }
};

export const getAllBikes = async (req: AdminRequest, res: Response) => {
  try {
    const bikes = await prisma.bike.findMany({ orderBy: { name: 'asc' } });
    const formatted = bikes.map((bike) => ({
      ...bike,
      features: parseFeatures(bike.features),
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching bikes:', error);
    res.status(500).json({ error: 'Failed to fetch bikes' });
  }
};

const parseFeatures = (features: string): string[] => {
  try {
    const parsed = JSON.parse(features);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const createBike = async (req: AdminRequest, res: Response) => {
  try {
    const { name, image, features, baseRatePerHour, baseRate12Hours, baseRate24Hours, category, available, odometer, lastServiceDate, nextServiceDue, maintenanceNote, status, price1Day, price2Days, price3Days, price7Days } = req.body;

    const bike = await prisma.bike.create({
      data: {
        name,
        image: image || '/images/placeholder.jpg',
        features: JSON.stringify(features || []),
        baseRatePerHour: Number(baseRatePerHour) || 0,
        baseRate12Hours: Number(baseRate12Hours) || 0,
        baseRate24Hours: Number(baseRate24Hours) || 0,
        category,
        available: Boolean(available),
        price1Day: Number(price1Day) || 0,
        price2Days: Number(price2Days) || 0,
        price3Days: Number(price3Days) || 0,
        price7Days: Number(price7Days) || 0,
        odometer: Number(odometer) || 0,
        lastServiceDate: lastServiceDate || null,
        nextServiceDue: nextServiceDue || null,
        maintenanceNote: maintenanceNote || '',
        status: status || 'active',
      },
    });

    res.status(201).json({ ...bike, features: parseFeatures(bike.features) });
  } catch (error) {
    console.error('Error creating bike:', error);
    res.status(500).json({ error: 'Failed to create bike' });
  }
};

export const updateBike = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, image, features, baseRatePerHour, baseRate12Hours, baseRate24Hours, category, available, odometer, lastServiceDate, nextServiceDue, maintenanceNote, status, price1Day, price2Days, price3Days, price7Days } = req.body;

    const data: any = {
      name,
      image: image || '/images/placeholder.jpg',
      features: JSON.stringify(features || []),
      baseRatePerHour: Number(baseRatePerHour) || 0,
      baseRate12Hours: Number(baseRate12Hours) || 0,
      baseRate24Hours: Number(baseRate24Hours) || 0,
      category,
      available: Boolean(available),
    };
    // Optional package pricing — only update if provided
    if (price1Day !== undefined) data.price1Day = Number(price1Day) || 0;
    if (price2Days !== undefined) data.price2Days = Number(price2Days) || 0;
    if (price3Days !== undefined) data.price3Days = Number(price3Days) || 0;
    if (price7Days !== undefined) data.price7Days = Number(price7Days) || 0;
    // Optional maintenance fields — only update if provided
    if (odometer !== undefined) data.odometer = Number(odometer) || 0;
    if (lastServiceDate !== undefined) data.lastServiceDate = lastServiceDate || null;
    if (nextServiceDue !== undefined) data.nextServiceDue = nextServiceDue || null;
    if (maintenanceNote !== undefined) data.maintenanceNote = maintenanceNote;
    if (status !== undefined) data.status = status;

    const bike = await prisma.bike.update({
      where: { id },
      data,
    });

    res.json({ ...bike, features: parseFeatures(bike.features) });
  } catch (error) {
    console.error('Error updating bike:', error);
    res.status(500).json({ error: 'Failed to update bike' });
  }
};

export const updateBikeAvailability = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    const bike = await prisma.bike.update({
      where: { id },
      data: { available: Boolean(available) },
    });

    res.json({ ...bike, features: parseFeatures(bike.features) });
  } catch (error) {
    console.error('Error updating bike availability:', error);
    res.status(500).json({ error: 'Failed to update bike availability' });
  }
};

export const updateBookingStatus = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const existing = await prisma.booking.findUnique({ where: { id }, include: { bike: true } });
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status, updatedAt: new Date().toISOString() },
    });

    // Send SMS notifications on status change
    if (status === 'confirmed' && existing.status !== 'confirmed') {
      sendBookingConfirmedSms(
        booking.customerPhone,
        booking.id,
        existing.bike.name,
        booking.startDate,
        booking.startTime
      ).catch(() => {});
    } else if (status === 'cancelled' && existing.status !== 'cancelled') {
      sendBookingCancelledSms(booking.customerPhone, booking.id, existing.bike.name).catch(() => {});
    } else if (status === 'completed' && existing.status !== 'completed') {
      sendBookingCompletedSms(booking.customerPhone, booking.id, existing.bike.name, 0).catch(() => {});
    }

    res.json(booking);
  } catch (error) {
    console.error('Error updating booking status:', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
};

// Admin: mark a bike as returned, computing late-return charges if applicable.
export const returnBike = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { actualReturnDate, actualReturnTime } = req.body;

    if (!actualReturnDate || !actualReturnTime) {
      return res.status(400).json({ error: 'actualReturnDate and actualReturnTime are required' });
    }

    const booking = await prisma.booking.findUnique({ where: { id }, include: { bike: true } });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'Booking already completed' });
    }
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot return a cancelled booking' });
    }

    // Compute late-return charge
    const scheduledEnd = parseDateTime(booking.endDate, booking.endTime);
    const actualEnd = parseDateTime(actualReturnDate, actualReturnTime);
    const lateMs = actualEnd.getTime() - scheduledEnd.getTime();
    const lateHours = lateMs / (1000 * 60 * 60);

    let lateReturnCharge = 0;
    if (lateHours > 0) {
      // Charge the bike's hourly rate for each late hour (rounded up)
      const chargeableHours = Math.ceil(lateHours);
      lateReturnCharge = chargeableHours * booking.bike.baseRatePerHour;
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: 'completed',
        actualReturnDate,
        actualReturnTime,
        lateReturnCharge,
        updatedAt: new Date().toISOString(),
      },
      include: { bike: true, accessories: { include: { accessory: true } } },
    });

    // Send SMS notification
    sendBookingCompletedSms(booking.customerPhone, booking.id, booking.bike.name, lateReturnCharge).catch(() => {});

    res.json({
      message: 'Bike returned successfully',
      booking: updated,
      lateReturnCharge,
      lateHours: lateHours > 0 ? Math.ceil(lateHours) : 0,
    });
  } catch (error) {
    console.error('Error processing bike return:', error);
    res.status(500).json({ error: 'Failed to process bike return' });
  }
};

// CSV export for bookings
export const exportBookingsCsv = async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string)?.trim() || '';
    const status = (req.query.status as string)?.trim() || '';
    const paymentStatus = (req.query.paymentStatus as string)?.trim() || '';
    const startDate = (req.query.startDate as string)?.trim() || '';
    const endDate = (req.query.endDate as string)?.trim() || '';

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (paymentStatus && paymentStatus !== 'all') where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search } },
        { id: { contains: search, mode: 'insensitive' } },
        { customerEmail: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.startDate = {};
      if (startDate) where.startDate.gte = startDate;
      if (endDate) where.startDate.lte = endDate;
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: { bike: true },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Booking ID', 'Customer Name', 'Phone', 'Email', 'Bike',
      'Start Date', 'Start Time', 'End Date', 'End Time', 'Duration (hrs)',
      'Base Amount', 'Accessories', 'Discount', 'GST', 'Total', 'Security Deposit',
      'Late Return Charge', 'Status', 'Payment Status', 'Payment Method',
      'Coupon Code', 'Created At',
    ];

    const rows = bookings.map((b) => [
      b.id,
      b.customerName,
      b.customerPhone,
      b.customerEmail,
      b.bike?.name || 'Unknown',
      b.startDate,
      b.startTime,
      b.endDate,
      b.endTime,
      b.durationHours,
      b.baseAmount,
      b.accessoriesTotal,
      b.discountAmount,
      b.gstAmount,
      b.calculatedRate,
      b.securityDeposit,
      b.lateReturnCharge,
      b.status,
      b.paymentStatus,
      b.paymentMethod || '',
      b.couponCode || '',
      b.createdAt,
    ]);

    const escapeCsv = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting bookings CSV:', error);
    res.status(500).json({ error: 'Failed to export bookings' });
  }
};

export const getCustomers = async (req: AdminRequest, res: Response) => {
  try {
    const search = (req.query.search as string)?.trim() || '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const bookings = await prisma.booking.findMany({
      include: { bike: true },
      orderBy: { createdAt: 'desc' },
    });

    const customerMap = new Map<string, any>();

    for (const booking of bookings) {
      const key = booking.customerPhone;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: `C-${booking.customerPhone.slice(-4)}`,
          name: booking.customerName,
          phone: booking.customerPhone,
          email: booking.customerEmail,
          idProof: booking.idProof,
          totalBookings: 0,
          totalSpent: 0,
          lastBooking: booking.createdAt,
          history: [],
        });
      }
      const customer = customerMap.get(key);
      customer.totalBookings += 1;
      if (booking.status !== 'cancelled') {
        customer.totalSpent += booking.calculatedRate;
      }
      customer.history.push({
        id: booking.id,
        bikeName: booking.bike?.name || 'Unknown Bike',
        startDate: booking.startDate,
        endDate: booking.endDate,
        amount: booking.calculatedRate,
        status: booking.status,
      });
    }

    let customers = Array.from(customerMap.values()).sort((a, b) => b.totalBookings - a.totalBookings);

    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(search) ||
          (c.email && c.email.toLowerCase().includes(q))
      );
    }

    const total = customers.length;
    const paginated = customers.slice((page - 1) * limit, page * limit);

    res.json({
      customers: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};
