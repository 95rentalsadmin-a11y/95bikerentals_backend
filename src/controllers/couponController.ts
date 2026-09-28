import { Response } from 'express';
import prisma from '../database/database';
import { AdminRequest } from '../middleware/adminAuth';
import { CustomerRequest } from '../middleware/customerAuth';

// Public: validate a coupon code against an order amount (no auth required for browsing)
export const validateCoupon = async (req: CustomerRequest, res: Response) => {
  try {
    const { code, orderAmount } = req.body;
    if (!code || orderAmount === undefined) {
      return res.status(400).json({ error: 'code and orderAmount are required' });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().trim() },
    });

    if (!coupon || !coupon.active) {
      return res.status(404).json({ error: 'Invalid or inactive coupon code' });
    }

    const now = new Date();
    const validFrom = new Date(coupon.validFrom);
    const validUntil = new Date(coupon.validUntil);
    if (now < validFrom || now > validUntil) {
      return res.status(400).json({ error: 'Coupon has expired or is not yet active' });
    }

    if (coupon.maxUses > 0 && coupon.usesCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'Coupon usage limit reached' });
    }

    if (orderAmount < coupon.minOrderAmount) {
      return res.status(400).json({
        error: `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`,
      });
    }

    // Compute discount
    let discount = 0;
    if (coupon.discountType === 'percentage') {
      discount = Math.round((orderAmount * coupon.discountValue) / 100);
    } else {
      discount = coupon.discountValue;
    }
    // Discount cannot exceed the order amount
    discount = Math.min(discount, orderAmount);

    res.json({
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: discount,
      finalAmount: orderAmount - discount,
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
};

// Admin: list all coupons
export const getAllCoupons = async (_req: AdminRequest, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(coupons);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
};

// Admin: create coupon
export const createCoupon = async (req: AdminRequest, res: Response) => {
  try {
    const { code, description, discountType, discountValue, minOrderAmount, maxUses, validFrom, validUntil, active } = req.body;
    if (!code || !discountType || discountValue === undefined || !validFrom || !validUntil) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!['percentage', 'flat'].includes(discountType)) {
      return res.status(400).json({ error: 'discountType must be percentage or flat' });
    }

    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        description: description || '',
        discountType,
        discountValue: Number(discountValue),
        minOrderAmount: Number(minOrderAmount) || 0,
        maxUses: Number(maxUses) || 0,
        validFrom,
        validUntil,
        active: active !== undefined ? Boolean(active) : true,
        createdAt: new Date().toISOString(),
      },
    });
    res.status(201).json(coupon);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Coupon code already exists' });
    }
    console.error('Error creating coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
};

// Admin: update coupon
export const updateCoupon = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { code, description, discountType, discountValue, minOrderAmount, maxUses, validFrom, validUntil, active } = req.body;
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...(code !== undefined && { code: code.toUpperCase().trim() }),
        ...(description !== undefined && { description }),
        ...(discountType !== undefined && { discountType }),
        ...(discountValue !== undefined && { discountValue: Number(discountValue) }),
        ...(minOrderAmount !== undefined && { minOrderAmount: Number(minOrderAmount) }),
        ...(maxUses !== undefined && { maxUses: Number(maxUses) }),
        ...(validFrom !== undefined && { validFrom }),
        ...(validUntil !== undefined && { validUntil }),
        ...(active !== undefined && { active: Boolean(active) }),
      },
    });
    res.json(coupon);
  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
};

// Admin: delete coupon
export const deleteCoupon = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.coupon.delete({ where: { id } });
    res.json({ message: 'Coupon deleted successfully' });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
};
