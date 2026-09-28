import { Response } from 'express';
import prisma from '../database/database';
import { AdminRequest } from '../middleware/adminAuth';

// Public: list all available accessories (for customer booking flow)
export const getAvailableAccessories = async (_req: any, res: Response) => {
  try {
    const accessories = await prisma.accessory.findMany({
      where: { available: true },
      orderBy: { name: 'asc' },
    });
    res.json(accessories);
  } catch (error) {
    console.error('Error fetching accessories:', error);
    res.status(500).json({ error: 'Failed to fetch accessories' });
  }
};

// Admin: list all accessories (including unavailable)
export const getAllAccessories = async (_req: AdminRequest, res: Response) => {
  try {
    const accessories = await prisma.accessory.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(accessories);
  } catch (error) {
    console.error('Error fetching accessories:', error);
    res.status(500).json({ error: 'Failed to fetch accessories' });
  }
};

// Admin: create accessory
export const createAccessory = async (req: AdminRequest, res: Response) => {
  try {
    const { name, description, pricePerDay, available } = req.body;
    if (!name || pricePerDay === undefined) {
      return res.status(400).json({ error: 'Name and pricePerDay are required' });
    }
    const accessory = await prisma.accessory.create({
      data: {
        name,
        description: description || '',
        pricePerDay: Number(pricePerDay) || 0,
        available: available !== undefined ? Boolean(available) : true,
        createdAt: new Date().toISOString(),
      },
    });
    res.status(201).json(accessory);
  } catch (error) {
    console.error('Error creating accessory:', error);
    res.status(500).json({ error: 'Failed to create accessory' });
  }
};

// Admin: update accessory
export const updateAccessory = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, pricePerDay, available } = req.body;
    const accessory = await prisma.accessory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(pricePerDay !== undefined && { pricePerDay: Number(pricePerDay) }),
        ...(available !== undefined && { available: Boolean(available) }),
      },
    });
    res.json(accessory);
  } catch (error) {
    console.error('Error updating accessory:', error);
    res.status(500).json({ error: 'Failed to update accessory' });
  }
};

// Admin: delete accessory
export const deleteAccessory = async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.accessory.delete({ where: { id } });
    res.json({ message: 'Accessory deleted successfully' });
  } catch (error) {
    console.error('Error deleting accessory:', error);
    res.status(500).json({ error: 'Failed to delete accessory' });
  }
};
