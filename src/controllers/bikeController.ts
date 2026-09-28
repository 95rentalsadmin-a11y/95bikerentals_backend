import { Request, Response } from 'express';
import prisma from '../database/database';

export const getAllBikes = async (req: Request, res: Response) => {
  try {
    const bikes = await prisma.bike.findMany({
      where: { available: true }
    });
    const formattedBikes = bikes.map((bike) => ({
      ...bike,
      features: JSON.parse(bike.features)
    }));
    res.json(formattedBikes);
  } catch (error) {
    console.error('Error fetching bikes:', error);
    res.status(500).json({ error: 'Failed to fetch bikes' });
  }
};

export const getBikeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bike = await prisma.bike.findUnique({
      where: { id }
    });

    if (!bike) {
      return res.status(404).json({ error: 'Bike not found' });
    }

    res.json({
      ...bike,
      features: JSON.parse(bike.features)
    });
  } catch (error) {
    console.error('Error fetching bike:', error);
    res.status(500).json({ error: 'Failed to fetch bike' });
  }
};

export const updateBikeAvailability = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { available } = req.body;

    const bike = await prisma.bike.update({
      where: { id },
      data: { available }
    });

    res.json({
      message: 'Bike availability updated successfully',
      bike
    });
  } catch (error) {
    console.error('Error updating bike availability:', error);
    res.status(500).json({ error: 'Failed to update bike availability' });
  }
};
